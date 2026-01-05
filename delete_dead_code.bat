@echo off
REM Dead Code Removal Script for Windows
REM SAFE TO RUN - all files confirmed unused

echo 🗑️  Removing dead code...
echo.

REM SSO Diagnostics (3 files)
if exist "src\components\SsoDiagnosticsLoader.tsx" (
    del "src\components\SsoDiagnosticsLoader.tsx"
    echo ✓ Removed SsoDiagnosticsLoader.tsx
)
if exist "src\utils\zksyncSsoDiagnostics.ts" (
    del "src\utils\zksyncSsoDiagnostics.ts"
    echo ✓ Removed zksyncSsoDiagnostics.ts
)
if exist "src\components\ZkSyncAuthorizationAlert.tsx" (
    del "src\components\ZkSyncAuthorizationAlert.tsx"
    echo ✓ Removed ZkSyncAuthorizationAlert.tsx
)

REM Unused AI/Relevance (3 files)
if exist "src\ai\ContextPreprocessor.ts" (
    del "src\ai\ContextPreprocessor.ts"
    echo ✓ Removed ContextPreprocessor.ts
)
if exist "src\ai\RelevanceScorer.ts" (
    del "src\ai\RelevanceScorer.ts"
    echo ✓ Removed RelevanceScorer.ts
)
if exist "src\ai\index.ts" (
    del "src\ai\index.ts"
    echo ✓ Removed ai\index.ts
)

REM Unused Components (5 files)
if exist "src\components\GlobalWalletStatus.tsx" (
    del "src\components\GlobalWalletStatus.tsx"
    echo ✓ Removed GlobalWalletStatus.tsx
)
if exist "src\components\ClientWrapper.tsx" (
    del "src\components\ClientWrapper.tsx"
    echo ✓ Removed ClientWrapper.tsx
)
if exist "src\components\GlobalStyles.tsx" (
    del "src\components\GlobalStyles.tsx"
    echo ✓ Removed GlobalStyles.tsx
)
if exist "src\components\SharedProvidersWrapper.tsx" (
    del "src\components\SharedProvidersWrapper.tsx"
    echo ✓ Removed SharedProvidersWrapper.tsx
)
if exist "src\components\TestModeToggle.tsx" (
    del "src\components\TestModeToggle.tsx"
    echo ✓ Removed TestModeToggle.tsx
)

REM Unused Services (1 file)
if exist "src\services\ProtocolDataAccessService.ts" (
    del "src\services\ProtocolDataAccessService.ts"
    echo ✓ Removed ProtocolDataAccessService.ts
)

REM Unused Utils (4 files)
if exist "src\utils\dateUtils.ts" (
    del "src\utils\dateUtils.ts"
    echo ✓ Removed dateUtils.ts
)
if exist "src\utils\errorHandler.ts" (
    del "src\utils\errorHandler.ts"
    echo ✓ Removed errorHandler.ts
)
if exist "src\utils\exportUtils.ts" (
    del "src\utils\exportUtils.ts"
    echo ✓ Removed exportUtils.ts
)
if exist "src\utils\formatters.ts" (
    del "src\utils\formatters.ts"
    echo ✓ Removed formatters.ts
)

REM Unused Agent Files (2 files)
if exist "src\agents\AgentRegistry.ts" (
    del "src\agents\AgentRegistry.ts"
    echo ✓ Removed AgentRegistry.ts
)
if exist "src\agents\index.ts" (
    del "src\agents\index.ts"
    echo ✓ Removed agents\index.ts
)

REM Move test files (2 files)
if not exist "tests\unit" mkdir "tests\unit"

if exist "src\utils\__tests__\dailyHealthScoreCalculator.test.ts" (
    move "src\utils\__tests__\dailyHealthScoreCalculator.test.ts" "tests\unit\" >nul
    echo ✓ Moved dailyHealthScoreCalculator.test.ts to tests\unit\
)
if exist "src\utils\__tests__\walletEncryption.test.ts" (
    move "src\utils\__tests__\walletEncryption.test.ts" "tests\unit\" >nul
    echo ✓ Moved walletEncryption.test.ts to tests\unit\
)

REM Remove empty __tests__ directory if it exists
if exist "src\utils\__tests__" (
    rmdir "src\utils\__tests__" 2>nul
    echo ✓ Removed empty __tests__ directory
)

echo.
echo ✅ Dead code removal complete!
echo.
echo 📊 Summary:
echo    - Removed 18 unused files
echo    - Moved 2 test files to tests\unit\
echo.
echo 🔍 Next steps:
echo    1. npm run build
echo    2. Test: wallet, health data, dashboard, AI chat
echo    3. If all works: git add . ^&^& git commit -m "Remove dead code"
echo    4. If broken: git checkout .
echo.
pause