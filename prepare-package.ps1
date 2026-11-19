$sourceDir = "D:\MESS x TELE"
$exportDir = "D:\KudoX_Export_Package"

if (Test-Path $exportDir) {
    Remove-Item -Path $exportDir -Recurse -Force
}
New-Item -ItemType Directory -Path $exportDir | Out-Null

Write-Host "1. Copying source code and core configs..."
Copy-Item "$sourceDir\src" -Destination "$exportDir\src" -Recurse -Force
Copy-Item "$sourceDir\public" -Destination "$exportDir\public" -Recurse -Force
Copy-Item "$sourceDir\package.json" -Destination "$exportDir\package.json" -Force
Copy-Item "$sourceDir\package-lock.json" -Destination "$exportDir\package-lock.json" -Force
Copy-Item "$sourceDir\tsconfig.json" -Destination "$exportDir\tsconfig.json" -Force
Copy-Item "$sourceDir\.env.example" -Destination "$exportDir\.env.example" -Force
Copy-Item "$sourceDir\eng.traineddata" -Destination "$exportDir\eng.traineddata" -Force
if (Test-Path "$sourceDir\cloudflared.exe") {
    Copy-Item "$sourceDir\cloudflared.exe" -Destination "$exportDir\cloudflared.exe" -Force
}

Write-Host "2. Copying node_modules..."
Copy-Item "$sourceDir\node_modules" -Destination "$exportDir\node_modules" -Recurse -Force

Write-Host "3. Copying accounts and session data without Chrome junk cache..."
New-Item -ItemType Directory -Path "$exportDir\.user-data" | Out-Null
Copy-Item "$sourceDir\.user-data\accounts_vault_local.json" -Destination "$exportDir\.user-data\accounts_vault_local.json" -Force
Copy-Item "$sourceDir\.user-data\extensions" -Destination "$exportDir\.user-data\extensions" -Recurse -Force

$excludePatterns = @(
    '\\Default\\Cache\\',
    '\\Default\\Code Cache\\',
    '\\Default\\GPUCache\\',
    '\\Default\\DawnCache\\',
    '\\Default\\Service Worker\\',
    '\\Crashpad\\',
    '\\optimization_guide_model_store\\',
    '\\OptGuideManifestModel\\',
    '\\component_crx_cache\\',
    '\\WasmTtsEngine\\',
    '\\OptimizationGuideModelsManifest\\',
    '\\Safe Browsing\\'
)

$profilesDir = "$sourceDir\.user-data\profiles"
if (Test-Path $profilesDir) {
    $targetProfilesDir = "$exportDir\.user-data\profiles"
    New-Item -ItemType Directory -Path $targetProfilesDir | Out-Null
    
    Get-ChildItem -Path $profilesDir -Recurse -File | ForEach-Object {
        $filePath = $_.FullName
        $skip = $false
        foreach ($pat in $excludePatterns) {
            if ($filePath -like "*$pat*") { $skip = $true; break }
        }
        if (-not $skip) {
            $relativePath = $filePath.Substring($profilesDir.Length + 1)
            $destFile = Join-Path $targetProfilesDir $relativePath
            $destDir = Split-Path $destFile -Parent
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
            Copy-Item $filePath -Destination $destFile -Force
        }
    }
}

$fbProfileDir = "$sourceDir\.user-data\fb-profile"
if (Test-Path $fbProfileDir) {
    $targetFbDir = "$exportDir\.user-data\fb-profile"
    New-Item -ItemType Directory -Path $targetFbDir | Out-Null
    
    Get-ChildItem -Path $fbProfileDir -Recurse -File | ForEach-Object {
        $filePath = $_.FullName
        $skip = $false
        foreach ($pat in $excludePatterns) {
            if ($filePath -like "*$pat*") { $skip = $true; break }
        }
        if (-not $skip) {
            $relativePath = $filePath.Substring($fbProfileDir.Length + 1)
            $destFile = Join-Path $targetFbDir $relativePath
            $destDir = Split-Path $destFile -Parent
            if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
            Copy-Item $filePath -Destination $destFile -Force
        }
    }
}

$totalSizeMB = [math]::Round(((Get-ChildItem -Path $exportDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB), 2)
Write-Host "Success! Clean Package Size: $totalSizeMB MB"
