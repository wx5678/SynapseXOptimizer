param([Parameter(Mandatory)][string]$Directory,[ValidateSet('Apply','Restore')][string]$Mode='Apply')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../state/animation-speed-test'))
$taskDir=[IO.Path]::GetFullPath($Directory)
if([IO.Path]::GetDirectoryName($taskDir) -ne $taskRoot -or [IO.Path]::GetFileName($taskDir) -notmatch '^huoshu-wuji-[a-zA-Z0-9]+$'){throw 'Unexpected test directory'}
$taskManifest=Get-Content -LiteralPath (Join-Path $taskDir 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$taskTarget=[IO.Path]::GetFullPath($taskManifest.target)
$taskAllowed='D:/game/'+[string][char]0x6e38+[char]0x620f+[char]0x8717+[char]0x725b+'/9yinjh/res/ini.package'
if($taskTarget -ne [IO.Path]::GetFullPath($taskAllowed)){throw 'Unexpected target'}
if($taskManifest.originalHash -ne '265d4b526f50be3e9ca182360dfe60b9da5e2d1e4a71296f76c4f4e0c02af4a0' -or $taskManifest.candidateHash -ne '96da474646cdeed7a4ec9f257876a70232e003060b6b434148e825880e18213f'){throw 'Invalid hash'}
foreach($taskPath in @($taskDir,$taskTarget)){if((Get-Item -LiteralPath $taskPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected path not supported'}}
$taskOriginal=Join-Path $taskDir 'ini.package.original'
$taskCandidate=Join-Path $taskDir 'ini.package.candidate'
if((Get-FileHash -LiteralPath $taskOriginal).Hash -ne $taskManifest.originalHash -or (Get-FileHash -LiteralPath $taskCandidate).Hash -ne $taskManifest.candidateHash){throw 'Backup or candidate changed'}
$taskExpected=if($Mode -eq 'Apply'){$taskManifest.originalHash}else{$taskManifest.candidateHash}
$taskNew=if($Mode -eq 'Apply'){$taskManifest.candidateHash}else{$taskManifest.originalHash}
$taskSource=if($Mode -eq 'Apply'){$taskCandidate}else{$taskOriginal}
if(@(Get-Process fxgame,fxgame64 -ErrorAction SilentlyContinue).Count -gt 0){throw 'Exit game before applying/restoring'}
if((Get-FileHash -LiteralPath $taskTarget).Hash -ne $taskExpected){throw 'Game resource changed; refusing overwrite'}
$taskId=[Guid]::NewGuid().ToString('N')
$taskStage=Join-Path ([IO.Path]::GetDirectoryName($taskTarget)) ('.synapsex-animation-'+$taskId+'.tmp')
$taskPrevious=Join-Path ([IO.Path]::GetDirectoryName($taskTarget)) ('.synapsex-animation-'+$taskId+'.previous')
Copy-Item -LiteralPath $taskSource -Destination $taskStage
if((Get-FileHash -LiteralPath $taskStage).Hash -ne $taskNew){throw 'Staging check failed'}
if(@(Get-Process fxgame,fxgame64 -ErrorAction SilentlyContinue).Count -gt 0){throw 'Game started; replacement cancelled'}
if((Get-FileHash -LiteralPath $taskTarget).Hash -ne $taskExpected){throw 'Game changed; replacement cancelled'}
[IO.File]::Replace($taskStage,$taskTarget,$taskPrevious,$false)
if((Get-FileHash -LiteralPath $taskTarget).Hash -ne $taskNew -or (Get-FileHash -LiteralPath $taskPrevious).Hash -ne $taskExpected){throw 'Verification failed; backups retained'}
[pscustomobject]@{Mode=$Mode;Target=$taskTarget;Hash=$taskNew;Backup=$taskOriginal;ReplacedCopy=$taskPrevious;RuntimeEffectVerified=$false} | ConvertTo-Json
