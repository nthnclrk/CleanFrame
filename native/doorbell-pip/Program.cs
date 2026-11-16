// CleanFrame doorbell picture-in-picture for a rooted Samsung Tizen TV.
// A small EFL notification window that sits above whatever is playing, shows a camera's
// newest frame from an MJPEG stream a few times a second, and exits after a fixed time or when asked.
// The window setup follows Vetro's launcher (MIT, Copyright (c) 2026 Vetro contributors).
//
// Any remote key closes it while it shows.
// Usage: dotnet cleanframe-pip.dll --url <mjpeg stream url> [--seconds 30] [--x 1408] [--y 32]
//        [--w 480] [--h 640] [--fps 4] [--stop <path>]
// The url must be http on a private address; the stop file, if it appears, closes the window.
using System;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;

namespace CleanFramePip
{
    internal static class Efl
    {
        private const string Elm = "libelementary.so.1", Evas = "libevas.so.1", Ecore = "libecore.so.1", EflUtil = "libcapi-ui-efl-util.so.0";
        public const int ElmWinNotification = 12;
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate byte TaskCb(IntPtr data);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void EvasCb(IntPtr data, IntPtr evas, IntPtr obj, IntPtr eventInfo);
        public const int EvasCallbackKeyDown = 10;
        [DllImport(Elm)] public static extern void elm_win_activate(IntPtr win);
        [DllImport(Evas)] public static extern void evas_object_event_callback_add(IntPtr obj, int type, EvasCb cb, IntPtr data);
        [DllImport(Evas)] public static extern void evas_object_focus_set(IntPtr obj, [MarshalAs(UnmanagedType.U1)] bool focus);
        [DllImport(Elm)] public static extern int elm_init(int argc, IntPtr argv);
        [DllImport(Elm)] public static extern void elm_run();
        [DllImport(Elm)] public static extern void elm_exit();
        [DllImport(Elm)] public static extern void elm_shutdown();
        [DllImport(Elm)] public static extern IntPtr elm_win_add(IntPtr parent, string name, int type);
        [DllImport(Elm)] public static extern void elm_win_title_set(IntPtr win, string title);
        [DllImport(Elm)] public static extern void elm_win_alpha_set(IntPtr win, [MarshalAs(UnmanagedType.U1)] bool alpha);
        [DllImport(Elm)] public static extern void elm_win_borderless_set(IntPtr win, [MarshalAs(UnmanagedType.U1)] bool borderless);
        [DllImport(Elm)] public static extern void elm_win_prop_focus_skip_set(IntPtr win, [MarshalAs(UnmanagedType.U1)] bool skip);
        [DllImport(Elm)] public static extern void elm_win_layer_set(IntPtr win, int layer);
        [DllImport(Elm)] public static extern int elm_win_aux_hint_add(IntPtr win, string hint, string val);
        [DllImport(Evas)] public static extern IntPtr evas_object_evas_get(IntPtr obj);
        [DllImport(Evas)] public static extern void evas_object_move(IntPtr obj, int x, int y);
        [DllImport(Evas)] public static extern void evas_object_resize(IntPtr obj, int w, int h);
        [DllImport(Evas)] public static extern void evas_object_show(IntPtr obj);
        [DllImport(Evas)] public static extern void evas_object_color_set(IntPtr obj, int r, int g, int b, int a);
        [DllImport(Evas)] public static extern IntPtr evas_object_rectangle_add(IntPtr evas);
        [DllImport(Evas)] public static extern IntPtr evas_object_image_add(IntPtr evas);
        [DllImport(Evas)] public static extern void evas_object_image_filled_set(IntPtr img, [MarshalAs(UnmanagedType.U1)] bool filled);
        [DllImport(Evas)] public static extern void evas_object_image_memfile_set(IntPtr img, IntPtr data, int size, string format, string key);
        [DllImport(Evas)] public static extern int evas_object_image_load_error_get(IntPtr img);
        [DllImport(Evas)] public static extern void evas_object_image_file_set(IntPtr img, string file, string key);
        [DllImport(Evas)] public static extern void evas_object_image_border_set(IntPtr img, int l, int r, int t, int b);
        [DllImport(Evas)] public static extern void evas_object_clip_set(IntPtr obj, IntPtr clip);
        [DllImport(Ecore)] public static extern IntPtr ecore_timer_add(double seconds, TaskCb func, IntPtr data);
        [DllImport(EflUtil)] public static extern int efl_util_set_notification_window_level(IntPtr win, int level);
        [DllImport("libc")] public static extern int setenv(string name, string value, int overwrite);
        [DllImport("libc")] public static extern uint getuid();
    }

    internal static class Program
    {
        // Glass frame geometry (res/frame.png is 128px with a 9-slice border of 48): the window
        // leaves room for the soft shadow; the video sits inside a 12px frosted rim.
        private const int PadX = 16, PadTop = 12, PadBottom = 20, Rim = 12;
        private static IntPtr _img, _win;
        private static bool _mapped;
        private static string _url, _stop, _log;
        private static DateTime _until;
        private static HttpClient _http;
        private static Efl.TaskCb _frameCb, _endCb;   // Kept alive for the native timers.
        private static readonly Efl.EvasCb KeyCb = OnKey;
        private static int _frames, _failures;
        private static byte[] _latest;               // Newest complete JPEG from the reader thread.
        private static int _latestId, _shownId;
        private static readonly object Gate = new object();

        // Reads the multipart MJPEG stream on a background thread and keeps only the newest frame.
        private static void Reader()
        {
            var buf = new byte[1 << 20];
            while (DateTime.UtcNow < _until)
            {
                try
                {
                    using (var stream = _http.GetStreamAsync(_url).GetAwaiter().GetResult())
                    {
                        int len = 0, start = -1;
                        while (DateTime.UtcNow < _until)
                        {
                            if (len == buf.Length) { len = 0; start = -1; }   // Oversized frame: resync.
                            int n = stream.Read(buf, len, buf.Length - len);
                            if (n <= 0) break;
                            int from = Math.Max(1, len - 1); len += n;
                            for (int i = from; i < len; i++)
                            {
                                if (buf[i - 1] == 0xFF && buf[i] == 0xD8) start = i - 1;
                                else if (start >= 0 && buf[i - 1] == 0xFF && buf[i] == 0xD9)
                                {
                                    var jpeg = new byte[i + 1 - start];
                                    Buffer.BlockCopy(buf, start, jpeg, 0, jpeg.Length);
                                    lock (Gate) { _latest = jpeg; _latestId++; }
                                    start = -1;
                                    Buffer.BlockCopy(buf, i + 1, buf, 0, len - i - 1); len -= i + 1; i = 0;
                                }
                            }
                            if (start < 0 && len > 1) { buf[0] = buf[len - 1]; len = 1; }
                            else if (start > 0) { Buffer.BlockCopy(buf, start, buf, 0, len - start); len -= start; start = 0; }
                        }
                    }
                }
                catch (Exception e) { if (++_failures == 1 || _failures % 10 == 0) Log("stream failed: " + e.GetType().Name); Thread.Sleep(500); }
            }
        }

        private static string Arg(string[] a, string name, string fallback)
        {
            for (int i = 0; i < a.Length - 1; i++) if (a[i] == name) return a[i + 1];
            return fallback;
        }
        private static int IntArg(string[] a, string name, int fallback, int min, int max)
        {
            int v; return int.TryParse(Arg(a, name, ""), out v) && v >= min && v <= max ? v : fallback;
        }
        private static void Log(string s) { try { if (_log != null) File.AppendAllText(_log, DateTime.Now.ToString("HH:mm:ss ") + s + "\n"); } catch (Exception) { } }

        // Same rules as Vetro's launcher: the compositor socket lives under XDG_RUNTIME_DIR.
        private static void SetupEnvironment()
        {
            bool egl = Directory.Exists("/dev/dri");
            Efl.setenv("ELM_ENGINE", "gl", 1);
            Efl.setenv("ECORE_EVAS_ENGINE", egl ? "wayland_egl" : "wayland_shm", 1);
            string uid = Efl.getuid().ToString(), runtime = null;
            foreach (string c in new[] { Environment.GetEnvironmentVariable("XDG_RUNTIME_DIR"), "/run/user/" + uid, "/run", "/run/user/5001" })
                if (!string.IsNullOrEmpty(c) && File.Exists(Path.Combine(c, "wayland-0"))) { runtime = c; break; }
            Efl.setenv("XDG_RUNTIME_DIR", runtime ?? "/run", 1);
            Efl.setenv("WAYLAND_DISPLAY", "wayland-0", 0);
            Efl.setenv("ELM_PROFILE", "tv", 0);
            Efl.setenv("ELM_DISPLAY", "wl", 0);
            if (egl) { Efl.setenv("ELM_ACCEL", "gl", 0); Efl.setenv("EVAS_GL_NO_BLACKLIST", "1", 0); }
        }

        private static byte Frame(IntPtr data)
        {
            if (DateTime.UtcNow >= _until || (_stop != null && File.Exists(_stop))) { Efl.elm_exit(); return 0; }
            byte[] jpeg; int id;
            lock (Gate) { jpeg = _latest; id = _latestId; }
            if (jpeg == null || id == _shownId) return 1;
            _shownId = id;
            GCHandle pin = GCHandle.Alloc(jpeg, GCHandleType.Pinned);
            try { Efl.evas_object_image_memfile_set(_img, pin.AddrOfPinnedObject(), jpeg.Length, "jpg", null); }
            finally { pin.Free(); }
            if (++_frames == 1) Log("first frame " + jpeg.Length + " bytes, load error " + Efl.evas_object_image_load_error_get(_img));
            // The window appears only once it has a picture, never as an empty box.
            if (!_mapped) { _mapped = true; Efl.evas_object_show(_win); Efl.elm_win_activate(_win); Efl.evas_object_focus_set(_win, true); }
            return 1;
        }

        private static byte End(IntPtr data) { Efl.elm_exit(); return 0; }

        // The PiP takes the remote while it shows; any key (Back, OK or an arrow) closes it and
        // returns the remote to the app underneath, so the remote never feels stuck.
        private static void OnKey(IntPtr data, IntPtr evas, IntPtr obj, IntPtr eventInfo)
        {
            try { Log("key " + Marshal.PtrToStringAnsi(Marshal.ReadIntPtr(eventInfo)) + " closes"); } catch (Exception) { }
            Efl.elm_exit();
        }

        public static int Main(string[] args)
        {
            _url = Arg(args, "--url", "");
            if (!Regex.IsMatch(_url, @"^http://(10|192\.168|172\.(1[6-9]|2\d|3[01]))(\.\d{1,3}){2,3}:\d{2,5}/[A-Za-z0-9/._?=&%-]{1,200}$"))
            { Console.Error.WriteLine("--url must be http on a private address"); return 2; }
            int seconds = IntArg(args, "--seconds", 30, 5, 600), fps = IntArg(args, "--fps", 4, 1, 10);
            int w = IntArg(args, "--w", 480, 120, 1920), h = IntArg(args, "--h", 640, 120, 1080);
            int winW = w + 2 * (PadX + Rim), winH = h + PadTop + PadBottom + 2 * Rim;
            int x = IntArg(args, "--x", 1920 - 24 - winW, 0, 1920), y = IntArg(args, "--y", 20, 0, 1080);
            _stop = Arg(args, "--stop", null);
            _log = Arg(args, "--log", null);
            _until = DateTime.UtcNow.AddSeconds(seconds);
            _http = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
            new Thread(Reader) { IsBackground = true, Name = "mjpeg" }.Start();
            if (_stop != null) try { File.Delete(_stop); } catch (Exception) { }

            SetupEnvironment();
            Efl.elm_init(0, IntPtr.Zero);
            IntPtr win = _win = Efl.elm_win_add(IntPtr.Zero, "cleanframe-pip", Efl.ElmWinNotification);
            if (win == IntPtr.Zero) { Log("elm_win_add failed"); return 3; }
            Efl.elm_win_title_set(win, "cleanframe-pip");
            Efl.elm_win_borderless_set(win, true);
            Efl.elm_win_alpha_set(win, true);
            Efl.elm_win_prop_focus_skip_set(win, false);
            int level = Efl.efl_util_set_notification_window_level(win, 40);
            Efl.elm_win_layer_set(win, 900);
            Efl.elm_win_aux_hint_add(win, "wm.policy.win.user.geometry", "1");
            Efl.elm_win_aux_hint_add(win, "wm.comp.win.effect.enable", "0");
            Efl.evas_object_move(win, x, y);
            Efl.evas_object_resize(win, winW, winH);

            IntPtr evas = Efl.evas_object_evas_get(win);
            string res = Path.Combine(AppContext.BaseDirectory, "res");
            IntPtr frame = Efl.evas_object_image_add(evas);
            Efl.evas_object_image_file_set(frame, Path.Combine(res, "frame.png"), null);
            Efl.evas_object_image_border_set(frame, 48, 48, 48, 48);
            Efl.evas_object_image_filled_set(frame, true);
            Efl.evas_object_move(frame, 0, 0); Efl.evas_object_resize(frame, winW, winH); Efl.evas_object_show(frame);
            int vx = PadX + Rim, vy = PadTop + Rim;
            // Rounded video: a 9-slice mask image clips the frame.
            IntPtr mask = Efl.evas_object_image_add(evas);
            Efl.evas_object_image_file_set(mask, Path.Combine(res, "mask.png"), null);
            Efl.evas_object_image_border_set(mask, 24, 24, 24, 24);
            Efl.evas_object_image_filled_set(mask, true);
            Efl.evas_object_move(mask, vx, vy); Efl.evas_object_resize(mask, w, h); Efl.evas_object_show(mask);
            _img = Efl.evas_object_image_add(evas);
            Efl.evas_object_image_filled_set(_img, true);
            Efl.evas_object_move(_img, vx, vy); Efl.evas_object_resize(_img, w, h);
            Efl.evas_object_clip_set(_img, mask);
            Efl.evas_object_event_callback_add(win, Efl.EvasCallbackKeyDown, KeyCb, IntPtr.Zero);
            Efl.evas_object_show(_img);
            Log("frame load " + Efl.evas_object_image_load_error_get(frame) + ", mask load " + Efl.evas_object_image_load_error_get(mask));
            Log("window " + w + "x" + h + " at " + x + "," + y + " level=" + level + " for " + seconds + "s");

            _frameCb = Frame; _endCb = End;
            Efl.ecore_timer_add(1.0 / fps, _frameCb, IntPtr.Zero);
            Efl.ecore_timer_add(seconds, _endCb, IntPtr.Zero);
            Efl.elm_run();
            Efl.elm_shutdown();
            Log("closed after " + _frames + " frames");
            return 0;
        }
    }
}
