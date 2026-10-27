$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskTemplate = Join-Path $PSScriptRoot 'vps'
$taskSuffix = Get-Date -Format 'yyyyMMdd-HHmmss'
$taskStage = Join-Path $PSScriptRoot "packages\falconx-vps-$taskSuffix"
$taskArchive = "$taskStage.zip"

New-Item -ItemType Directory -Path $taskStage -Force | Out-Null
foreach ($taskName in @('package.json', 'package-lock.json', 'tsconfig.json', 'src')) {
    Copy-Item -LiteralPath (Join-Path $taskRoot $taskName) -Destination $taskStage -Recurse
}

$taskPublic = Join-Path $taskStage 'public'
New-Item -ItemType Directory -Path $taskPublic | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRoot 'public\index.html') -Destination $taskPublic
if (Test-Path -LiteralPath (Join-Path $taskRoot 'public\scripts')) {
    Copy-Item -LiteralPath (Join-Path $taskRoot 'public\scripts') -Destination $taskPublic -Recurse
}
Get-ChildItem -LiteralPath $taskTemplate -Force -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $taskStage
}

# Use an explicit file allowlist rather than copying the workspace and removing
# secrets afterwards. tar preserves dotfiles and uses paths relative to staging.
& tar -a -c -f $taskArchive -C $taskStage .
if ($LASTEXITCODE -ne 0) {
    throw "Could not create deployment archive: $taskArchive"
}
$taskHash = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash
Write-Output "Archive: $taskArchive"
Write-Output "SHA256: $taskHash"
