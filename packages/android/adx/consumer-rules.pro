# theaimart adx-android is reflection-free; no consumer ProGuard/R8 rules are required.
# Keep the public API if the host app strips unused classes aggressively:
-keep public class co.theaimart.adx.** { public *; }
