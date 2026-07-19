# Dependency Patches

This folder is used by `patch-package`.

Do not move these files into `src/` or a feature module. The `postinstall` script runs `patch-package`, which looks here by default and reapplies local fixes to dependencies after `npm install`.
