# Public release review

The original publication record below was prepared 20 October 2026. For the current release, use the GitHub release notes and the validation results for its exact revision. CleanFrame began on one personal Samsung The Frame. Very little portability work has been done. The README presents it as a starting point to fork and adapt at the user's own risk.

## Source boundary

That initial public source contained the 0.6.1 app, public-font screenshot, development tools, browser tests, setup notes and asset notices. Research folders, design studies, draft writing, unused Grid/optics code and obsolete generated images were removed after the owner's approval. Recoverable copies remain outside the public source.

Paid Pangram fonts, signing keys, account tokens, local device addresses, recovery state and personal signed widgets remain in ignored local storage. Public preview and export use only Manrope, Geist and Newsreader. The public font check also verifies the expected font files and hashes.

## Asset review

Each of the fifteen wallpaper pages was checked for author and Unsplash licence on 20 October 2026; see [asset sources](asset-sources.md). ABC and SBS icons now use documented MIT Custom Brand Icons sources. Font and icon licence texts are retained. Original code uses MIT; third-party assets keep their own terms in [third-party notices](../THIRD_PARTY_NOTICES.md).

## Validation

A separate clean snapshot contains 193 files, about 17 MB, without private setup. It passed `npm ci`, source/resource checks, public-source and font-hash checks, all 344 Chromium acceptance checks, and an unsigned public-font export. The export contains exactly three public font binaries. `npm audit` reported zero known vulnerabilities. The retained material and icon-metric generators also passed local smoke checks. These results do not establish physical-TV behaviour.

Gitleaks found no credential leaks in the two published pre-release main commits, the cleaned source directory or the clean release history. Thirteen local proprietary font binaries were compared against the clean release Git objects; none matched. All local Markdown links resolved. The 107 source images contained no private location or descriptive metadata; the retained EXIF fields were dimensions, colour space and resolution. Automated checks are bounded: they cannot guarantee the absence of every possible secret or establish third-party rights beyond the documented source review.

The GitHub check workflow uses public fonts and browser validation. Check its result for the revision being published; local success and hosted success are separate results.

## Publication boundary

The existing private Git history contains the removed studies. Deleting current files does not remove those earlier versions. A separate clean Git history was prepared for the public copy, and the original history is backed up privately.

The owner approved this publication route on 20 October 2026: keep the original GitHub repository private, rename it `CleanFrame-private-backup`, and create a fresh `CleanFrame` repository from the reviewed clean history. Validate the new remote source and hosted checks while private, then change only the new copy to public. Update local Git routing so the old history cannot be pushed into the public copy.

This route avoids relying on a force-push to erase earlier hosted objects. [GitHub documents](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) that rewritten commits can remain accessible through cached views or references. The recommendation to retain the old repository privately follows from that limitation. The approval covers renaming the private repository, creating the clean copy and publishing it. Future device work, release uploads and changes to visibility need their own instructions.

At the GitHub inventory check, the repository was private, with one main branch, no tags, no releases, no Actions runs and no Actions artifacts. Recheck that inventory before changing visibility. Verify the remote source and unauthenticated public view after the approved visibility change. The private backup must remain private.

Keep public downloads to the unsigned public-font export with its notices. Personal signed packages can contain proprietary fonts. Reference-device installation results are recorded in [TV status](tv-status.md); the public-source review did not contact or change the TV.
