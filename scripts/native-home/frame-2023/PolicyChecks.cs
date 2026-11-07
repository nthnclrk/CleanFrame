// Pure host-side checks. The fake backend never loads a TV library or contacts a TV.
using System;
using System.Collections.Generic;
using System.Text;
using System.Text.Json;

class PolicyChecks {
    const string Original = "com.example.stock.Home";
    const string Target = "AbCdEf1234.FrameHome";
    const string Other = "Other12345.Home";
    static readonly string Identity = new string('a', 64);
    const string Home = "db/appfw/home_appid";
    const string Startup = "db/appfw/startup_appid";
    const string Backup = "db/appfw/booting_appid_backup";
    const string First = "db/first_screen/type";

    static HomeState Stock() {
        return new HomeState { Operation = Original, DefaultApp = Original, Autostart = 1,
            Settings = new Dictionary<string,string> {
                [Home] = Original, [Startup] = Original, [Backup] = Original, [First] = Original
            } };
    }
    static HomeState Copy(HomeState s) {
        return new HomeState { Operation = s.Operation, DefaultApp = s.DefaultApp,
            Autostart = s.Autostart, Settings = new Dictionary<string,string>(s.Settings) };
    }
    static void Check(bool ok, string name) { if (!ok) throw new Exception(name); }
    static void Reject(Action action, string name) {
        try { action(); } catch (Exception) { return; }
        throw new Exception(name);
    }

    sealed class Fake : IHomeBackend {
        public HomeState Current = Stock();
        public readonly List<string> Writes = new List<string>();
        public bool Installed = true;
        public bool FailNext;
        public bool ChangeOnFailure;
        public bool ReplaceOwnerOnFailure;
        public bool ChangeStartupOnSet;
        public bool LeaveDefaultOnSet;
        public HomeState Read() { return Copy(Current); }
        public bool TargetInstalled() { return Installed; }
        public int SetHome(string app) {
            Writes.Add(app);
            if (FailNext) {
                FailNext = false;
                if (ChangeOnFailure) Current.Operation = Current.DefaultApp = app;
                if (ReplaceOwnerOnFailure) Current.Operation = Current.DefaultApp = Other;
                return -1;
            }
            Current.Operation = app;
            if (!LeaveDefaultOnSet || app == Original) Current.DefaultApp = app;
            if (ChangeStartupOnSet) Current.Settings[Startup] = app;
            return 0;
        }
    }

    static int Main() {
        var now = new DateTimeOffset(2026, 1, 2, 12, 0, 0, TimeSpan.Zero);
        Check(HomePolicy.FreshPreflight("2026-01-02T12:00:00Z", now), "Current preflight must be accepted");
        Check(HomePolicy.FreshPreflight("2026-01-02T11:58:00Z", now), "Preflight remains valid at two minutes");
        Check(!HomePolicy.FreshPreflight("2026-01-02T11:57:59Z", now), "Stale preflight must be rejected");
        Check(HomePolicy.FreshPreflight("2026-01-02T12:00:15Z", now), "Small clock skew must be accepted");
        Check(!HomePolicy.FreshPreflight("2026-01-02T12:00:16Z", now), "Excess future clock skew must be rejected");
        Check(!HomePolicy.FreshPreflight("2026-01-02T15:00:00+03:00", now), "Non-UTC preflight must be rejected");
        Check(!HomePolicy.FreshPreflight("2026-01-02T12:00:00", now), "Preflight without an explicit timezone must be rejected");
        Check(!HomePolicy.FreshPreflight("not-a-date", now), "Malformed preflight must be rejected");
        var initial = Stock();
        var baseline = HomePolicy.Capture(initial, Target, Identity);
        Check(HomePolicy.ValidBaseline(baseline, Target, Identity), "A complete baseline must be accepted");
        var multilingual = HomePolicy.Capture(initial, Target, Identity);
        multilingual.Original.Settings[Home] = "synthetic-\u2600";
        byte[] saved = HomePolicy.EncodeBaseline(multilingual);
        string line = HomePolicy.FormatBaseline(saved);
        const string marker = "CLEANFRAME_2023_BASELINE=";
        Check(line.StartsWith(marker, StringComparison.Ordinal), "Baseline output must use its recovery marker");
        byte[] fromOutput = Encoding.UTF8.GetBytes(line.Substring(marker.Length));
        Check(Convert.ToBase64String(saved) == Convert.ToBase64String(fromOutput),
              "Captured baseline bytes must match the recoverable stdout payload");
        Check(JsonSerializer.Deserialize<HomeBaseline>(fromOutput).Original.Settings[Home] == "synthetic-\u2600",
              "Baseline output must preserve non-ASCII data");
        Check(HomePolicy.Same(initial, baseline.Original), "Capture must preserve every original setting");
        Check(!HomePolicy.ValidBaseline(baseline, Other, Identity), "A baseline from another launcher must be rejected");
        Check(!HomePolicy.ValidBaseline(baseline, Target, new string('b', 64)), "A baseline from another TV must be rejected");
        Check(!HomePolicy.ValidBaseline(baseline, Target, "not-a-device-hash"), "Malformed identity must be rejected");
        var invalid = HomePolicy.Capture(initial, Target, Identity); invalid.Model = "unrelated-model";
        Check(!HomePolicy.ValidBaseline(invalid, Target, Identity), "Another model must be rejected");
        invalid = HomePolicy.Capture(initial, Target, Identity); invalid.Firmware = "unrelated-firmware";
        Check(!HomePolicy.ValidBaseline(invalid, Target, Identity), "Another firmware must be rejected");
        invalid = HomePolicy.Capture(initial, Target, Identity); invalid.Original.Settings[First] = "";
        Check(!HomePolicy.ValidBaseline(invalid, Target, Identity), "An empty original setting must be rejected");
        Reject(() => HomePolicy.Capture(new HomeState(), Target, Identity), "Missing native state must not become stock");
        Reject(() => HomePolicy.Capture(initial, Target, "NOT-A-SHA256"), "Capture requires a device-bound identity");
        var mismatched = Stock(); mismatched.DefaultApp = Other;
        Reject(() => HomePolicy.Capture(mismatched, Target, Identity), "Disagreeing Home getters must not be captured");
        var missing = Stock(); missing.Settings.Remove(First);
        Reject(() => HomePolicy.Capture(missing, Target, Identity), "An absent original key must not be invented");
        var alreadyApplied = Stock(); alreadyApplied.Operation = alreadyApplied.DefaultApp = Target;
        Reject(() => HomePolicy.Capture(alreadyApplied, Target, Identity), "Applied target must not become the original baseline");

        var apply = new Fake();
        var applied = HomePolicy.Apply(apply, baseline, Target, Identity);
        Check(applied.Operation == Target && applied.DefaultApp == Target, "Apply must bind both Home getters to the launcher");
        Check(apply.Writes.Count == 1 && apply.Writes[0] == Target, "Apply must make one Home assignment");
        foreach (var key in initial.Settings.Keys)
            Check(applied.Settings[key] == initial.Settings[key], "Apply must not change non-Home setting " + key);
        Check(applied.Autostart == initial.Autostart, "Apply must preserve autostart");
        var restored = HomePolicy.Restore(apply, baseline, Target, Identity);
        Check(HomePolicy.Same(restored, initial), "Restore must recover the exact baseline");
        Check(apply.Writes.Count == 2 && apply.Writes[1] == Original, "Restore must select the original Home owner");
        var noChange = new Fake();
        Check(HomePolicy.Same(HomePolicy.Restore(noChange, baseline, Target, Identity), initial), "Already restored state must be accepted");
        Check(noChange.Writes.Count == 0, "Already restored state must not trigger a setter");
        var removedTarget = new Fake { Installed = false };
        removedTarget.Current.Operation = removedTarget.Current.DefaultApp = Target;
        Check(HomePolicy.Same(HomePolicy.Restore(removedTarget, baseline, Target, Identity), initial),
              "Recovery must remain possible after the target is removed");

        var stale = new Fake(); stale.Current.Settings[Startup] = Other;
        Reject(() => HomePolicy.Apply(stale, baseline, Target, Identity), "A stale baseline must stop apply");
        Check(stale.Writes.Count == 0, "A stale baseline must not write");
        var missingApp = new Fake(); missingApp.Installed = false;
        Reject(() => HomePolicy.Apply(missingApp, baseline, Target, Identity), "A missing target must stop apply");
        Check(missingApp.Writes.Count == 0, "A missing target must not write");
        var unknown = new Fake(); unknown.Current.Operation = unknown.Current.DefaultApp = Other;
        Reject(() => HomePolicy.Restore(unknown, baseline, Target, Identity), "Restore must reject a third-party Home owner");
        Check(unknown.Writes.Count == 0, "Restore must not overwrite a third-party owner");

        var failed = new Fake { FailNext = true, ChangeOnFailure = true };
        Reject(() => HomePolicy.Apply(failed, baseline, Target, Identity), "An unsuccessful setter must report failure");
        Check(HomePolicy.Same(failed.Current, initial), "An uncertain target assignment must be restored when safe");
        Check(failed.Writes.Count == 2 && failed.Writes[0] == Target && failed.Writes[1] == Original,
              "Safe recovery must only restore the original Home owner");
        var replacement = new Fake { FailNext = true, ReplaceOwnerOnFailure = true };
        Reject(() => HomePolicy.Apply(replacement, baseline, Target, Identity), "Unexpected owner after failure must stop recovery");
        Check(replacement.Writes.Count == 1 && replacement.Current.Operation == Other,
              "Failure recovery must not overwrite an unexpected owner");
        var changed = new Fake { ChangeStartupOnSet = true };
        Reject(() => HomePolicy.Apply(changed, baseline, Target, Identity), "An automatic startup change must be reported");
        Check(changed.Writes.Count == 1, "Recovery must not write when non-Home settings drifted");
        var mismatchedAfter = new Fake { LeaveDefaultOnSet = true };
        Reject(() => HomePolicy.Apply(mismatchedAfter, baseline, Target, Identity), "Getter disagreement after apply must fail");
        Check(HomePolicy.Same(mismatchedAfter.Current, initial), "A partially applied known owner must be restored");
        var failedRestore = new Fake { FailNext = true, ChangeOnFailure = true };
        failedRestore.Current.Operation = failedRestore.Current.DefaultApp = Target;
        Reject(() => HomePolicy.Restore(failedRestore, baseline, Target, Identity), "A failed explicit restore must report failure");
        Check(failedRestore.Writes.Count == 1, "An explicit restore must never be automatically retried");
        Console.WriteLine("Home operation and recovery policy checks passed; no TV APIs were called.");
        return 0;
    }
}
