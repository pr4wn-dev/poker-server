# ============================================================
# FULL PROJECT VERIFICATION SCRIPT
# Run this at HOME to compare against boss's machine state
# ============================================================
# 
# EXPECTED COMMIT HASHES (from boss's machine, Feb 12 2026):
#   Server: 0da3d44f5f99c1b3c10a2c0a844dfcf11fc252ce
#   Client: e628a3146f97927240936c259c7bf19bb1ee36bf
#
# HOW TO USE:
#   1. cd to poker-server repo
#   2. Run: .\verify-files.ps1
#   3. It checks BOTH repos (server + client)
#   4. Red = MISMATCH or MISSING, Green = OK
# ============================================================

$ErrorActionPreference = "Continue"

$serverRepo = "C:\Users\Becca\source\repos\poker-server"
$clientRepo = "C:\Projects\poker-client-unity"

$expectedServerCommit = "0da3d44f5f99c1b3c10a2c0a844dfcf11fc252ce"
$expectedClientCommit = "e628a3146f97927240936c259c7bf19bb1ee36bf"

$totalChecks = 0
$passed = 0
$failed = 0
$missing = 0

function Check-File {
    param($repo, $file, $expectedHash)
    $script:totalChecks++
    $fullPath = Join-Path $repo $file
    if (-not (Test-Path $fullPath)) {
        Write-Host "  MISSING: $file" -ForegroundColor Red
        $script:missing++
        return
    }
    $actualHash = (git -C $repo hash-object $file 2>$null)
    if ($actualHash -eq $expectedHash) {
        # Silent pass - only show problems
        $script:passed++
    } else {
        Write-Host "  CHANGED: $file" -ForegroundColor Yellow
        Write-Host "    Expected: $expectedHash" -ForegroundColor DarkGray
        Write-Host "    Actual:   $actualHash" -ForegroundColor DarkGray
        $script:failed++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " FULL PROJECT VERIFICATION" -ForegroundColor Cyan
Write-Host " Boss machine state: Feb 12, 2026" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# CHECK 1: Git commit hashes
# ============================================================
Write-Host "[1/4] CHECKING COMMIT HASHES..." -ForegroundColor White

$actualServerCommit = (git -C $serverRepo log -1 --format="%H" 2>$null)
$actualClientCommit = (git -C $clientRepo log -1 --format="%H" 2>$null)

if ($actualServerCommit -eq $expectedServerCommit) {
    Write-Host "  Server commit: OK ($($expectedServerCommit.Substring(0,7)))" -ForegroundColor Green
} else {
    Write-Host "  Server commit: MISMATCH" -ForegroundColor Red
    Write-Host "    Expected: $expectedServerCommit" -ForegroundColor DarkGray
    Write-Host "    Actual:   $actualServerCommit" -ForegroundColor DarkGray
    Write-Host "    TIP: Run 'git pull origin master' in $serverRepo" -ForegroundColor Yellow
}

if ($actualClientCommit -eq $expectedClientCommit) {
    Write-Host "  Client commit: OK ($($expectedClientCommit.Substring(0,7)))" -ForegroundColor Green
} else {
    Write-Host "  Client commit: MISMATCH" -ForegroundColor Red
    Write-Host "    Expected: $expectedClientCommit" -ForegroundColor DarkGray
    Write-Host "    Actual:   $actualClientCommit" -ForegroundColor DarkGray
    Write-Host "    TIP: Run 'git pull origin master' in $clientRepo" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================
# CHECK 2: Server source files (every .js file)
# ============================================================
Write-Host "[2/4] CHECKING SERVER FILES..." -ForegroundColor White

# Core server files
Check-File $serverRepo "src/server.js" "98023ab76e207a106c98744a6dd1c472a6f17b9d"
Check-File $serverRepo "src/setup.js" "2add3e6cc7e768a1da95eacaace952c5faa129b5"

# Game engine
Check-File $serverRepo "src/game/Table.js" "511c57e0fd6d70dda80d60a2de229cd712396f49"
Check-File $serverRepo "src/game/GameManager.js" "6eb211b8d3e772d3d96a93209fac79563694c019"
Check-File $serverRepo "src/game/BotManager.js" "20c6d07f2213829ac0b11b92abf6c3904c87ab62"
Check-File $serverRepo "src/game/BotPlayer.js" "52aa404c2011bea0b2ce43db2c647167596c42dd"
Check-File $serverRepo "src/game/HandEvaluator.js" "98a847e0b27eed66bf31a2667789db75cfd05875"
Check-File $serverRepo "src/game/Deck.js" "b84cec83c23a2785a7eddcdc57af0710995faecb"
Check-File $serverRepo "src/game/ItemAnte.js" "93778042793a8485c95cd00d29e089869e17bf8b"
Check-File $serverRepo "src/game/Tournament.js" "38e8c79a0ce7da0f9d04fd8a0e288773beb95118"
Check-File $serverRepo "src/game/TournamentManager.js" "5ce529c3ad3dc6c632a6946426a0e98c1a002caa"
Check-File $serverRepo "src/game/CharacterSystem.js" "dde51aa44dc011e2bedca5adfb962bcebdc9ce1a"
Check-File $serverRepo "src/game/FireTracker.js" "4632f05d64d54eb18fd96f71b7dccb5ee9a647b5"
Check-File $serverRepo "src/game/RobberyManager.js" "ac80634c1392054e03e746c34e35b0fb78b0f766"
Check-File $serverRepo "src/game/SpectatorOdds.js" "76d43b60bcb808f257fb2fb2485e5ec793cfd3f4"

# Adventure
Check-File $serverRepo "src/adventure/AdventureManager.js" "83b3f3483e9bc33a54b27153952f9608d774ce56"
Check-File $serverRepo "src/adventure/AdventurePokerGame.js" "805df6057bc506d87c5173f27030822c5e4b2610"
Check-File $serverRepo "src/adventure/Boss.js" "712f2032a421feaeb8b53a967485e0acf6fdcf72"
Check-File $serverRepo "src/adventure/BossAI.js" "73e6efaffdf42c05d47db61707ffa0c590c406e1"
Check-File $serverRepo "src/adventure/WorldMap.js" "e99789481e4b023891a20002adedba0619587f84"

# Stats
Check-File $serverRepo "src/stats/StatsEngine.js" "b182fa2159ccefd7684c7146722d53751d55f906"
Check-File $serverRepo "src/stats/StatsCalculator.js" "3d685f28d4245bf97811dbe97926f656f041b4a5"
Check-File $serverRepo "src/stats/TitleEngine.js" "2eaea4bb73bf24e41ed44cc19a46a40241bec72b"

# Social
Check-File $serverRepo "src/social/CrewManager.js" "e68b7859fc4b0f593af02cf07e792685e3b54d62"
Check-File $serverRepo "src/social/FriendsManager.js" "47e459fb8b924575e852cd161949c9507d8b59b0"

# Other systems
Check-File $serverRepo "src/events/EventManager.js" "df071532db6b47758d874896f034a8124dbf21e3"
Check-File $serverRepo "src/security/CollusionDetector.js" "7123a21de5b4d1d319bf4bed6d601aa2f431fe64"
Check-File $serverRepo "src/sockets/SocketHandler.js" "816f523cd6fb96d7fe12b38c96eb00d511cc0876"
Check-File $serverRepo "src/sockets/Events.js" "9891c7bf1a56d809d40cdaf45e84bb0913529624"
Check-File $serverRepo "src/database/Database.js" "d91fb3aa4e55b25f3fb95147a48b6555e6c677f1"
Check-File $serverRepo "src/database/UserRepository.js" "8f907eecde0dad6d63858f24e0c3daf11901f730"
Check-File $serverRepo "src/models/Item.js" "aebcf72391d20566b3baf930cbd3c9fecfdba8d2"
Check-File $serverRepo "src/models/User.js" "7bbb6de4ee2f3912f48bba5a8b2c725f6ac76369"
Check-File $serverRepo "src/models/HouseRules.js" "2a66acc166dbe8e58b0e2dac1d07b89799158c47"
Check-File $serverRepo "src/utils/GameLogger.js" "e9f3e8f752b691cfd3da858d49b326d3a7a546af"

# Docs
Check-File $serverRepo "README.md" "d6346d8b093fb463c633c5adc4942828aa118473"
Check-File $serverRepo "CHANGELOG.md" "c25fef4c91ea6512b19f72221259a7acc594ecfb"
Check-File $serverRepo "FEATURE_INVENTORY.md" "b29e5b8ede756702cd73e24a2867b8eb39e50bc2"
Check-File $serverRepo "INSTALL.md" "23c87eadd13f586a64579b5c6cb0744495d14904"
Check-File $serverRepo "package.json" "d6f76d439bf83c1de9afe91960bbb9f503f176b3"

Write-Host ""

# ============================================================
# CHECK 3: Client source files (every .cs scene + component)
# ============================================================
Write-Host "[3/4] CHECKING CLIENT SOURCE FILES..." -ForegroundColor White

# Core scripts
Check-File $clientRepo "Assets/Scripts/Core/AudioManager.cs" "b889673eb2bfa533352599d19af09619d1afc5d8"
Check-File $clientRepo "Assets/Scripts/Core/CharacterSoundManager.cs" "585d6fe0c29103f7b676b7e2293e912bcb86cf3c"
Check-File $clientRepo "Assets/Scripts/Core/GameManager.cs" "a9e1b9e32f7acaa82b5f5ef631adaea39c5b0c1d"
Check-File $clientRepo "Assets/Scripts/Core/PlayerCharacter.cs" "034bbb8303db2ee02c9cb3b20f4bde0e733194a1"
Check-File $clientRepo "Assets/Scripts/Core/ProjectSetup.cs" "a6db7574a443e2db70bab4a2bdc63c7785f9828e"
Check-File $clientRepo "Assets/Scripts/Core/SceneBootstrap.cs" "6eb02a14607bb9432e3aa22103abb1808946785d"
Check-File $clientRepo "Assets/Scripts/Core/SceneTransition.cs" "d296d83ecc1897577ee6e0a4b1182ddf7324cd7b"

# Networking
Check-File $clientRepo "Assets/Scripts/Networking/GameService.cs" "8de37e9d085f85d058bcaabbca1c13ec19c73be8"
Check-File $clientRepo "Assets/Scripts/Networking/NetworkModels.cs" "3afa34d35c8a02b0a614ab4fbcda84f0f8d7cb08"
Check-File $clientRepo "Assets/Scripts/Networking/PokerEvents.cs" "9b01b4527b58248611ab719d2c8af45a7854d121"
Check-File $clientRepo "Assets/Scripts/Networking/PokerNetworkManager.cs" "5d33cf0df7f66078ef964f6da87eb9172449864b"
Check-File $clientRepo "Assets/Scripts/Networking/SocketManager.cs" "c6061cf205f3db9309a913546a07e55a5f0b5950"

# UI Core
Check-File $clientRepo "Assets/Scripts/UI/Core/GameTheme.cs" "22a61042cda5259a7dd0c371d2076eb503b02af0"
Check-File $clientRepo "Assets/Scripts/UI/Core/UIAnimations.cs" "5b51f55dd0e71c08bcd9d723aebd2b18f2f755c8"
Check-File $clientRepo "Assets/Scripts/UI/Core/UIFactory.cs" "ca34723aa2573e9acedd04c3a7a3eafb7c793853"
Check-File $clientRepo "Assets/Scripts/UI/Core/UISoundEffects.cs" "53c769370dd97206050ac7208c5f3d058352561d"
Check-File $clientRepo "Assets/Scripts/UI/Core/UISpriteFactory.cs" "0508dda3442e6db01e0abe1c37d78d6e3cc4ef81"
Check-File $clientRepo "Assets/Scripts/UI/Core/UIVisualEffects.cs" "6c34ff697f32f34a59ea15c1fe487cbd55ef4048"

# UI Scenes (THE IMPORTANT ONES)
Check-File $clientRepo "Assets/Scripts/UI/Scenes/MainMenuScene.cs" "103efdbe1911a9e6ed9e1f6c807704c992f3f9f1"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/LobbyScene.cs" "d6d882054862a46a07401e59aae783faa4a9f0ad"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/TableScene.cs" "07d3fdfae669b7702d26c2823d569ec98a36cbe1"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/StatisticsScene.cs" "d580994eaefe4881ed29c817980e9041de7b0181"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/CharacterSelectScene.cs" "ab1b8419f2bacd7276dba8f8ffc4f7d8433c166f"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/TournamentScene.cs" "4356efd3a06e054e00ce49b1743ff3b1b7716b93"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/AdventureMapScene.cs" "1833a5d350a69ad0be6fce82373f00d4237dd8d8"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/AdventureBattleScene.cs" "d97fcb89a738bdf0681124fd3aa6e41670b6d695"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/AdventureScene.cs" "bab70a0fbf9f3d8beb7ac4711cbbe89b5b1dc787"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/InventoryScene.cs" "38d8ffe5e18f2d501babde2c065913aecfa6835f"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/CrewScene.cs" "1e94a69c822b81fcafdd3fb58b80a80e43da0920"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/RobberyScene.cs" "eb1b78e0424ece45d0d53fd8a1a92d396061fdff"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/HandReplayScene.cs" "97410fcadc01469aefc4cf632c6c563481c29269"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/LeaderboardScene.cs" "ace2d6d705c7c9a13a743ba112d06d41dd7b10e2"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/ShopScene.cs" "ef67f6b9b7a87d605b1b21a6ec2487b3eb9d89dc"
Check-File $clientRepo "Assets/Scripts/UI/Scenes/SettingsScene.cs" "5a1dccc0632dc58eb7c8c5edd4642d8e145a224d"

# UI Components
Check-File $clientRepo "Assets/Scripts/UI/Components/PokerTableView.cs" "c04484791585ad846feab546642daaafb72b6977"
Check-File $clientRepo "Assets/Scripts/UI/Components/PlayerSeat.cs" "fc619e7dc796cf2b04511215010d090f5f168021"
Check-File $clientRepo "Assets/Scripts/UI/Components/CardVisual.cs" "9a8b77051244b84a50891045247fff65006a9259"
Check-File $clientRepo "Assets/Scripts/UI/Components/InventoryPanel.cs" "2f97b6f688aa8a3801a3ba7f608a4ad0b0ef708b"
Check-File $clientRepo "Assets/Scripts/UI/Components/PlayerProfilePopup.cs" "e45e496c1430b820a6105948927a5bcb59c31edd"
Check-File $clientRepo "Assets/Scripts/UI/Components/SpectatorPanel.cs" "0da6e450e95e27aaa37759d985e894349b736abd"
Check-File $clientRepo "Assets/Scripts/UI/Components/FriendsPanel.cs" "12374d8a2d3d9373e8bb5c1ed5651f0a35ff84c3"
Check-File $clientRepo "Assets/Scripts/UI/Components/DailyRewardsPopup.cs" "c1b67ada9067208975101552dfcce5c1efb710ce"
Check-File $clientRepo "Assets/Scripts/UI/Components/AchievementsPanel.cs" "f465d441364f80a79c61fa4ebd633d545eba95fc"
Check-File $clientRepo "Assets/Scripts/UI/Components/ChatPanel.cs" "4619744e2db24f2311ef87feb2b3043e2bdc5fb1"
Check-File $clientRepo "Assets/Scripts/UI/Components/ActionPanel.cs" "3644b17ef5a5f520d965639d7dded9270fa9df51"
Check-File $clientRepo "Assets/Scripts/UI/Components/ConfirmDialog.cs" "e5ac010a1f9c78328107aeb6bb08c40acd7e04b0"
Check-File $clientRepo "Assets/Scripts/UI/Components/ToastNotification.cs" "cd507cea4f59354965c02d7ed2a4b5110abecdba"
Check-File $clientRepo "Assets/Scripts/UI/Components/WinnerAnimation.cs" "75424b2d3a2349bfcd158f5a8f4a73cadc9beb6c"
Check-File $clientRepo "Assets/Scripts/UI/Components/HandHistoryPanel.cs" "1cc8162a71e9d33f6556304f18c106fce2481166"
Check-File $clientRepo "Assets/Scripts/UI/Components/TournamentBracket.cs" "b8e77e3e8660817edaeac41cc4c8dda04bff32a6"
Check-File $clientRepo "Assets/Scripts/UI/Components/RebuyPanel.cs" "e814ceec6e8be913bcb51df534c171dfb957d110"
Check-File $clientRepo "Assets/Scripts/UI/Components/SpectatorBar.cs" "f303943c2b33211f37d3e791883f4fd9ef86eaa3"
Check-File $clientRepo "Assets/Scripts/UI/Components/SpriteManager.cs" "c95ceb506d1290fe6779f5ed948ce58d57be0445"
Check-File $clientRepo "Assets/Scripts/UI/Components/LoadingOverlay.cs" "2a8b9ba1fb0fce4965b99cb33918207695f89170"
Check-File $clientRepo "Assets/Scripts/UI/Components/InvitePopup.cs" "5de9e9287f8ee3ea587b0b87e1ad5064968cdec4"
Check-File $clientRepo "Assets/Scripts/UI/Components/EmotePanel.cs" "274fd3fff11a150230ee5df3ebc97984cc673bae"
Check-File $clientRepo "Assets/Scripts/UI/Components/ChipStack.cs" "97c3bf751a489f1f70bfec2e6ef550dda976c3ba"
Check-File $clientRepo "Assets/Scripts/UI/Components/PokerTableLayout.cs" "fb642c5c74887acd8ee4d3e8e2b6667e29e1982c"
Check-File $clientRepo "Assets/Scripts/UI/Components/TutorialOverlay.cs" "b5b65f826d649515852472fa00ca024ce5ce5e24"
Check-File $clientRepo "Assets/Scripts/UI/Components/CardPositionLogger.cs" "137627a25b55c62e12fc86f8c39804610ea810ac"

# Legacy UI files
Check-File $clientRepo "Assets/Scripts/UI/FriendsUI.cs" "0dd7ed37139e7219bf65a2691b28ecacfd403933"
Check-File $clientRepo "Assets/Scripts/UI/MultiplayerLobbyUI.cs" "9e22e94a25f9b824bc6cb9a1052cc6b670eb55dc"

# Adventure
Check-File $clientRepo "Assets/Scripts/Adventure/AdventureController.cs" "7f0a9a91edb68de89d480391d0ce9b03da8367b7"

# Scenes (.unity files)
Check-File $clientRepo "Assets/Scenes/MainMenuScene.unity" "681d680cb5009aff0af046bd5bd4e8e1dc6feb4e"
Check-File $clientRepo "Assets/Scenes/LobbyScene.unity" "1ff11c618a9f57720c08249e4d5bf73a2f808db1"
Check-File $clientRepo "Assets/Scenes/TableScene.unity" "d8ca2f0c17247dfad5c728499b975c4b7a04f980"
Check-File $clientRepo "Assets/Scenes/StatisticsScene.unity" "5cd2898a9fcdbe243212b081f9f0872924144419"
Check-File $clientRepo "Assets/Scenes/CharacterSelectScene.unity" "9d19300fb3728f30b36cb84d61b51b5a616c68c3"
Check-File $clientRepo "Assets/Scenes/TournamentScene.unity" "aa10833850c7209b6892f9c656fbc541ced4cdee"
Check-File $clientRepo "Assets/Scenes/AdventureScene.unity" "fdc412d2c8f63870e4ac6c323b0175099c7f8842"
Check-File $clientRepo "Assets/Scenes/AdventureBattleScene.unity" "aaa40c9338261b4551236f7645372a954776c885"
Check-File $clientRepo "Assets/Scenes/InventoryScene.unity" "8ed6cfcdcdcc222f25c0787a87757432bf0462b1"
Check-File $clientRepo "Assets/Scenes/CrewScene.unity" "536c56ccfc595b56344681f01dd900e9b89c2bae"
Check-File $clientRepo "Assets/Scenes/RobberyScene.unity" "3e2fab5d15ec730a221bb0f7d62769c21d2aa385"
Check-File $clientRepo "Assets/Scenes/HandReplayScene.unity" "d8e42482cf4bc63158806ba309da7cb4d655e11e"
Check-File $clientRepo "Assets/Scenes/LeaderboardScene.unity" "ef6ca58800c09d843026159ef143c4bb7e133749"
Check-File $clientRepo "Assets/Scenes/ShopScene.unity" "e6ef6727c9a648527b4a4723dc753305bcdbad06"
Check-File $clientRepo "Assets/Scenes/SettingsScene.unity" "48ccb67231e0ce72f5009990b3b6a3d3de6dc598"

# Project settings
Check-File $clientRepo "ProjectSettings/EditorBuildSettings.asset" "c54482a30b15f5b1c8edf9d58965953f3c3e789b"
Check-File $clientRepo "ProjectSettings/ProjectSettings.asset" "afefb9f0d6ea9502abe279b67d78f0d36104a858"

Write-Host ""

# ============================================================
# CHECK 4: Summary
# ============================================================
Write-Host "[4/4] RESULTS" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Total files checked: $totalChecks" -ForegroundColor White
Write-Host "  Passed (identical):  $passed" -ForegroundColor Green
Write-Host "  Changed:             $failed" -ForegroundColor $(if ($failed -gt 0) { "Yellow" } else { "Green" })
Write-Host "  Missing:             $missing" -ForegroundColor $(if ($missing -gt 0) { "Red" } else { "Green" })
Write-Host "========================================" -ForegroundColor Cyan

if ($failed -eq 0 -and $missing -eq 0) {
    Write-Host ""
    Write-Host "  ALL FILES MATCH! Nothing was lost." -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  FILES DIFFER! See details above." -ForegroundColor Red
    Write-Host "  If you made changes at home, CHANGED is expected." -ForegroundColor Yellow
    Write-Host "  If MISSING, run 'git pull origin master' in the relevant repo." -ForegroundColor Yellow
    Write-Host ""
}
