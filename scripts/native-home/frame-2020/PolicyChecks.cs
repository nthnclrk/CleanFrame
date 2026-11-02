// Offline checks: these exercise guards without loading any native TV library.
using System;
class PolicyChecks {
    static HomeControl.State State(int code, string home, int count, int target, int apps) {
        return new HomeControl.State { NativeReturn = code, NativeHome = home,
            Databases = new[] {
                new HomeControl.Rows { Exists = true, Count = count, TargetCount = target, AppCount = apps },
                new HomeControl.Rows { Exists = true }, new HomeControl.Rows { Exists = false }
            } };
    }
    static void Check(bool value, string label) {
        if (!value) throw new Exception(label);
    }
    static int Main() {
        var empty = State(-2, null, 0, 0, 0);
        Check(HomeControl.Empty(empty) && HomeControl.SafeToRemove(empty), "Exact absence must be recognised");
        var baseline = new HomeControl.Baseline { Firmware = "T-NKMDEUC-2743.0",
            TargetApp = "AbCdEf1234.FrameHome", Original = empty };
        Check(HomeControl.ValidBaseline(baseline), "Captured original state must match the selected profile");
        baseline.TargetApp = "Other12345.Home";
        Check(!HomeControl.ValidBaseline(baseline), "Another owner's baseline must be rejected");
        baseline.TargetApp = "AbCdEf1234.FrameHome";
        baseline.Firmware = "different-firmware";
        Check(!HomeControl.ValidBaseline(baseline), "Another firmware's baseline must be rejected");
        Check(!HomeControl.Empty(State(0, "", 0, 0, 0)), "Empty string must not become absence");
        Check(!HomeControl.SafeToRemove(State(-99, null, 0, 0, 0)), "Getter failure must stop restore");
        Check(!HomeControl.SafeToRemove(State(0, "Other12345.Home", 0, 0, 0)), "Another native assignment must stop restore");
        var target = State(0, "AbCdEf1234.FrameHome", 1, 1, 1);
        Check(HomeControl.TargetRows(target) && HomeControl.SafeToRemove(target), "The single trial row can be removed");
        Check(!HomeControl.Empty(target), "An applied assignment is not original absence");
        Check(!HomeControl.SafeToRemove(State(0, "AbCdEf1234.FrameHome", 1, 1, 2)), "An unrelated default for the app must stop restore");
        Check(!HomeControl.TargetRows(State(0, "AbCdEf1234.FrameHome", 1, 1, 2)), "Apply must not accept a state that restore refuses");
        Check(!HomeControl.SafeToRemove(State(0, "AbCdEf1234.FrameHome", 2, 1, 2)), "An unrelated operation row must stop restore");
        target.Databases[1].Count = 1;
        Check(!HomeControl.SafeToRemove(target), "Global assignment must stop restore");
        target.Databases[1].TargetCount = target.Databases[1].AppCount = 1;
        target.Databases[0].Count = target.Databases[0].TargetCount = target.Databases[0].AppCount = 0;
        Check(!HomeControl.SafeToRemove(target), "The selected app's global row is not an owner-scoped trial");
        Check(!HomeControl.SafeToRemove(new HomeControl.State()), "Missing row evidence must stop restore");
        Check(!HomeControl.Empty(new HomeControl.State()), "Missing row evidence is not absence");
        empty.Databases[1] = null;
        Check(!HomeControl.SafeToRemove(empty) && !HomeControl.Empty(empty), "Null row evidence must stop restore");
        var startup = new Startup.Baseline { Firmware = "T-NKMDEUC-2743.0",
            TargetApp = "AbCdEf1234.FrameHome", FirstScreen = "com.samsung.tv.csfs", AutoStart = 1 };
        Check(Startup.ValidBaseline(startup), "Reviewed first-screen baseline must be recognised");
        Check(Startup.CanApply(startup, "com.samsung.tv.csfs", true, 0, 1, true), "Apply accepts the matching original state");
        Check(!Startup.CanApply(startup, "com.samsung.tv.csfs", false, 0, 1, true), "Apply requires an installed launcher");
        Check(!Startup.CanApply(startup, "com.samsung.tv.csfs", true, 0, 0, true), "Apply rejects changed autostart");
        Check(!Startup.CanApply(startup, "com.samsung.tv.csfs", true, 0, 1, false), "Apply requires eligibility");
        Check(Startup.CanRestore(startup, "AbCdEf1234.FrameHome"), "Restore remains available after the launcher is removed or autostart changes");
        Check(Startup.CanRestore(startup, "com.samsung.tv.csfs"), "Already restored state is accepted");
        Check(!Startup.CanRestore(startup, "Other12345.Home") && !Startup.CanRestore(startup, null), "Restore cannot overwrite an unexpected target");
        startup.FirstScreen = "";
        Check(!Startup.ValidBaseline(startup), "Missing first-screen evidence must not become a default");
        startup.FirstScreen = "com.samsung.tv.csfs";
        startup.AutoStart = 0;
        Check(!Startup.ValidBaseline(startup), "A different autostart baseline must stop the operation");
        startup.AutoStart = 1;
        startup.TargetApp = "Other12345.Home";
        Check(!Startup.ValidBaseline(startup), "A first-screen baseline must belong to the selected launcher");
        Console.WriteLine("Home absence and restore guards passed; no native APIs called.");
        return 0;
    }
}
