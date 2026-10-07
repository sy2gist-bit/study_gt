<#
.SYNOPSIS
  스터디 가이드 콘텐츠 JSON 을 검증한다.

.DESCRIPTION
  스키마 위반과 상호 참조 오류를 잡는다. 이 저장소에서 가장 자주 조용히 깨지는 곳이
  카드/모듈/어댑터 사이의 id 참조라서(앱이 에러를 안 내고 회색으로 떨어지거나 버튼이
  안 뜬다) 그쪽을 집중적으로 본다.

  ERROR 는 고쳐야 하고, WARN 은 의도한 것이면 넘어가도 된다.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Validate-Content.ps1 -ContentId perca-ceas
#>
param(
  [Parameter(Mandatory = $true)][string]$ContentId,
  [string]$RepoRoot
)

$ErrorActionPreference = "Stop"
if (-not $RepoRoot) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path }

$script:Errors = @()
$script:Warns  = @()
function Add-Err ($m) { $script:Errors += $m }
function Add-Warn($m) { $script:Warns  += $m }

function Read-Json($path) {
  if (-not (Test-Path $path -PathType Leaf)) { return $null }
  try { return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json }
  catch { Add-Err "JSON 파싱 실패: $path - $($_.Exception.Message)"; return $null }
}
function Has-Prop($obj, $name) {
  if ($null -eq $obj) { return $false }
  return ($obj.PSObject.Properties.Name -contains $name)
}
function Is-Filled($v) { return -not ([string]::IsNullOrWhiteSpace([string]$v)) }

$PALETTE    = @("blue","orange","teal","red","gray")
$BLOCKTYPES = @("prose","list","callout","termGrid","equation","table","figureCard","qaList","diagram")
$REQUIRED   = @{
  prose      = @("text")
  list       = @("items")
  callout    = @("text")
  termGrid   = @("items")
  equation   = @("expr","meaning")
  table      = @("columns","rows")
  figureCard = @("items")
  qaList     = @("items")
}

# ---- 파일 로드 -------------------------------------------------
$contentPath  = Join-Path $RepoRoot "content\$ContentId.json"
$manifestPath = Join-Path $RepoRoot "content\manifest.json"
$content = Read-Json $contentPath
if ($null -eq $content) {
  Write-Host "ERROR: 콘텐츠를 찾을 수 없습니다: $contentPath" -ForegroundColor Red
  exit 1
}

foreach ($k in @("schemaVersion","adapter","meta","guide","source","modules","cards","output")) {
  if (-not (Has-Prop $content $k)) { Add-Err "최상위 키 누락: $k" }
}

# ---- meta ------------------------------------------------------
if ($content.meta.id -ne $ContentId) {
  Add-Err "meta.id('$($content.meta.id)') 가 파일명('$ContentId') 과 다릅니다. 앱이 이 값으로 진도를 네임스페이스 분리하므로 반드시 일치해야 합니다."
}
foreach ($k in @("eyebrow","title","subtitle","sourceRef","oneLiner")) {
  if (-not (Is-Filled $content.meta.$k)) { Add-Warn "meta.$k 가 비어 있습니다." }
}
if ($content.meta.title -match "<[a-zA-Z/]") {
  Add-Err "meta.title 에 HTML 태그가 있습니다. 이 값은 textContent 로 들어가 태그가 글자 그대로 보입니다."
}
# textContent 로 들어가는 필드에 HTML 엔티티가 있으면 &amp; 가 그대로 보인다.
# (innerHTML 필드인 subtitle/oneLiner 에서는 반대로 엔티티가 맞다.)
foreach ($f in @("title","eyebrow","sourceRef")) {
  if ($content.meta.$f -match "&(amp|lt|gt|quot|#\d+);") {
    Add-Err "meta.$f 에 HTML 엔티티가 있습니다('$($Matches[0])'). 이 필드는 textContent 로 들어가 엔티티가 글자 그대로 보입니다 - 일반 문자로 쓰세요."
  }
}
if (-not $content.meta.pills -or @($content.meta.pills).Count -eq 0) { Add-Warn "meta.pills 가 비어 있습니다." }

# ---- 어댑터 ----------------------------------------------------
$adapterPath = Join-Path $RepoRoot "adapters\$($content.adapter).json"
$adapter = Read-Json $adapterPath
if ($null -eq $adapter) {
  Add-Err "어댑터 파일이 없습니다: adapters\$($content.adapter).json (콘텐츠의 adapter 필드가 가리키는 값)"
} else {
  if ($adapter.id -ne $content.adapter) {
    Add-Err "어댑터의 id('$($adapter.id)') 가 파일명('$($content.adapter)') 과 다릅니다."
  }
  foreach ($t in @("guide","read","study","cards","output")) {
    if (-not (Is-Filled $adapter.tabLabels.$t)) { Add-Err "어댑터 tabLabels.$t 누락 - 탭 이름이 '$t' 로 그대로 보입니다." }
  }
  foreach ($c in @($adapter.cardCategories)) {
    if ($PALETTE -notcontains $c.color) { Add-Err "cardCategories['$($c.id)'].color='$($c.color)' 는 허용되지 않습니다. 가능: $($PALETTE -join ', ')" }
  }
  foreach ($c in @($adapter.moduleCategories)) {
    if ($PALETTE -notcontains $c.color) { Add-Err "moduleCategories['$($c.id)'].color='$($c.color)' 는 허용되지 않습니다. 가능: $($PALETTE -join ', ')" }
  }
  foreach ($n in @($adapter.notation)) {
    if ($n.render -ne "chemical-subscript") { Add-Warn "notation.render='$($n.render)' 는 구현되지 않았습니다. 동작하는 값은 chemical-subscript 뿐입니다." }
    try { [void][regex]::new($n.pattern) } catch { Add-Err "notation.pattern 이 유효한 정규식이 아닙니다: $($n.pattern)" }
  }
  if ((Has-Prop $adapter "outputMode") -and (Has-Prop $content.output "mode") -and $adapter.outputMode -ne $content.output.mode) {
    Add-Warn "adapter.outputMode='$($adapter.outputMode)' 와 content.output.mode='$($content.output.mode)' 가 다릅니다."
  }
}
$cardCatIds = @()
$modCatIds  = @()
if ($adapter) {
  $cardCatIds = @($adapter.cardCategories   | ForEach-Object { $_.id })
  $modCatIds  = @($adapter.moduleCategories | ForEach-Object { $_.id })
}

# ---- manifest --------------------------------------------------
$manifest = Read-Json $manifestPath
if ($null -eq $manifest) {
  Add-Err "content\manifest.json 을 읽지 못했습니다."
} else {
  $entry = @($manifest | Where-Object { $_.id -eq $ContentId })
  if ($entry.Count -eq 0) {
    Add-Err "manifest.json 에 '$ContentId' 항목이 없습니다. 파일이 있어도 선택 화면에 뜨지 않습니다. id 와 adapter 를 가진 항목을 추가하세요."
  } elseif ($entry[0].adapter -ne $content.adapter) {
    Add-Err "manifest 의 adapter('$($entry[0].adapter)') 와 콘텐츠의 adapter('$($content.adapter)') 가 다릅니다."
  }
}

# ---- source ----------------------------------------------------
$paraIds = @()
$secIds  = @()
$paraCount = 0
foreach ($sec in @($content.source.sections)) {
  if (-not (Is-Filled $sec.id))    { Add-Err "섹션에 id 가 없습니다." }
  if (-not (Is-Filled $sec.title)) { Add-Warn "섹션 '$($sec.id)' 에 title 이 없습니다." }
  $secIds += $sec.id
  foreach ($p in @($sec.paragraphs)) {
    $paraCount++
    $paraIds += $p.id
    if (-not (Is-Filled $p.id))       { Add-Err "섹션 '$($sec.id)' 안에 id 없는 문단이 있습니다." }
    if (-not (Is-Filled $p.original)) { Add-Err "문단 '$($p.id)' 의 original 이 비어 있습니다 - 원문 읽기 탭이 비게 됩니다." }
    if (-not (Is-Filled $p.assist))   { Add-Warn "문단 '$($p.id)' 에 assist(보조 해설)가 없습니다." }
  }
}
foreach ($d in @($paraIds | Group-Object | Where-Object { $_.Count -gt 1 })) {
  Add-Err "문단 id 중복: '$($d.Name)' ($($d.Count)회) - 앵커 이동이 엉뚱한 곳으로 갑니다."
}
if ($paraCount -eq 0) { Add-Warn "원문 문단이 하나도 없습니다." }

# ---- modules ---------------------------------------------------
$modIds = @()
foreach ($m in @($content.modules)) {
  $modIds += $m.id
  if (-not (Is-Filled $m.id))    { Add-Err "id 없는 모듈이 있습니다." }
  if (-not (Is-Filled $m.title)) { Add-Warn "모듈 '$($m.id)' 에 title 이 없습니다." }
  if ($adapter -and $modCatIds -notcontains $m.category) {
    Add-Err "모듈 '$($m.id)' 의 category='$($m.category)' 가 어댑터 moduleCategories 에 없습니다. 가능: $($modCatIds -join ', ')"
  }
  foreach ($b in @($m.blocks)) {
    if ($BLOCKTYPES -notcontains $b.type) {
      Add-Err "모듈 '$($m.id)' 에 알 수 없는 블록 타입 '$($b.type)'. 가능: $($BLOCKTYPES -join ', ')"
      continue
    }
    # diagram 은 svg 또는 imageUri 중 하나라 $REQUIRED 에 넣지 않았다.
    # ContainsKey 로 거르지 않으면 @($null) 이 1개짜리 배열이라 빈 필드명으로 루프가 돈다.
    if ($REQUIRED.ContainsKey($b.type)) {
      foreach ($f in @($REQUIRED[$b.type])) {
        if (-not (Has-Prop $b $f)) { Add-Err "모듈 '$($m.id)' 의 $($b.type) 블록에 필수 필드 '$f' 가 없습니다." }
      }
    }
    if ($b.type -eq "equation" -and -not (Is-Filled $b.meaning)) {
      Add-Err "모듈 '$($m.id)' 의 equation 블록에 meaning 이 비어 있습니다 - 식만 있고 뜻이 없으면 외울 수 없습니다."
    }
    if ($b.type -eq "table") {
      $colN = @($b.columns).Count
      $i = 0
      foreach ($r in @($b.rows)) {
        if (@($r).Count -ne $colN) { Add-Err "모듈 '$($m.id)' table 의 $i 번째 행 칸 수($(@($r).Count))가 columns($colN) 와 다릅니다." }
        $i++
      }
    }
    if ($b.type -eq "diagram") {
      if (-not (Is-Filled $b.svg) -and -not (Is-Filled $b.imageUri)) {
        Add-Err "모듈 '$($m.id)' diagram 블록에 svg 도 imageUri 도 없습니다."
      }
      if ((Is-Filled $b.svg) -and ($b.svg -match 'fill="#' -or $b.svg -match 'stroke="#')) {
        Add-Warn "모듈 '$($m.id)' diagram 의 svg 에 색이 하드코딩돼 있습니다. 다크 모드에서 안 보일 수 있으니 var(--ink) 같은 CSS 변수를 쓰세요."
      }
      if (Is-Filled $b.svg) {
        # SVG 는 컨테이너 폭(데스크톱 약 1060px)까지 늘어나므로, 화면상 글자 크기는
        # font-size x (1060 / viewBox 폭) 이다. viewBox 를 좁게 잡으면 글자가 거대해진다.
        $vb = [regex]::Match($b.svg, 'viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)')
        if (-not $vb.Success) {
          Add-Warn "모듈 '$($m.id)' diagram 의 svg 에 viewBox 가 없습니다. 화면 폭에 맞춰 늘고 줄게 하려면 viewBox 가 필요합니다."
        } else {
          $vbW = [double]$vb.Groups[1].Value
          # width 는 여는 <svg> 태그에서만 본다 — rect/line 의 width 속성까지 잡으면 전부 오탐이 된다.
          $openTag = [regex]::Match($b.svg, '<svg\b[^>]*>')
          if ($openTag.Success -and $openTag.Value -match '\bwidth\s*=\s*"\d') {
            Add-Warn "모듈 '$($m.id)' diagram 의 <svg> 에 고정 width 가 있습니다. viewBox 만 두는 편이 반응형입니다."
          }
          # 기준은 가장 작은 글자다. 제목용 큰 글자 하나가 큰 것은 정상이고,
          # 본문 글자까지 커졌을 때가 viewBox 를 좁게 잡은 신호다.
          $sizes = @([regex]::Matches($b.svg, 'font-size="([\d.]+)"') | ForEach-Object { [double]$_.Groups[1].Value })
          if ($sizes.Count -gt 0 -and $vbW -gt 0) {
            $minRendered = ($sizes | Measure-Object -Minimum).Minimum * (1060.0 / $vbW)
            if ($minRendered -gt 26) {
              Add-Warn ("모듈 '{0}' diagram 은 가장 작은 글자도 화면에서 약 {1}px 로 렌더됩니다(viewBox 폭 {2}). viewBox 폭을 680~720으로 넓히고 본문 글자를 14~17 단위로 쓰면 기존 콘텐츠와 결이 맞습니다." -f $m.id, [math]::Round($minRendered), $vbW)
            }
          }
        }
      }
    }
  }
}
foreach ($d in @($modIds | Group-Object | Where-Object { $_.Count -gt 1 })) {
  Add-Err "모듈 id 중복: '$($d.Name)' ($($d.Count)회)"
}

# ---- 시각적 정리 상태 -------------------------------------------
# 학습법 0단계가 "그림부터 보고 추측하기"라서, 볼 그림이 없으면 1단계부터 빈손이 된다.
# 구조적 관계를 산문으로만 늘어놓지 않았는지 본다.
$blockCount = @{}
foreach ($t in $BLOCKTYPES) { $blockCount[$t] = 0 }
foreach ($m in @($content.modules)) {
  foreach ($b in @($m.blocks)) {
    if ($blockCount.ContainsKey($b.type)) { $blockCount[$b.type]++ }
  }
}
$visual = $blockCount["diagram"] + $blockCount["table"] + $blockCount["figureCard"]
$totalBlocks = 0
foreach ($t in $BLOCKTYPES) { $totalBlocks += $blockCount[$t] }
if ($totalBlocks -gt 0) {
  if ($visual -eq 0) {
    Add-Warn "그림·표가 하나도 없습니다 (diagram 0, table 0, figureCard 0). 학습법 0단계가 '그림부터 보고 추측하기'인데 볼 것이 없습니다 - 구조적 관계는 diagram 으로, 비교와 숫자 모음은 table 로 옮길 데가 없는지 보세요."
  } elseif ($blockCount["diagram"] -eq 0 -and $totalBlocks -ge 20) {
    Add-Warn "블록 $totalBlocks 개 중 diagram 이 하나도 없습니다. 흐름·순환·구조 관계가 산문으로만 설명되고 있지 않은지 확인하세요."
  }
}

# ---- cards -----------------------------------------------------
$cardIds = @()
$coreN = 0
$noConcept = 0
$cards = @($content.cards)
foreach ($c in $cards) {
  $cardIds += $c.id
  if (-not (Is-Filled $c.id)) { Add-Err "id 없는 카드가 있습니다." }
  if (-not (Is-Filled $c.q))  { Add-Err "카드 '$($c.id)' 의 q 가 비어 있습니다." }
  if (-not (Is-Filled $c.a))  { Add-Err "카드 '$($c.id)' 의 a 가 비어 있습니다." }
  if ($adapter -and $cardCatIds -notcontains $c.category) {
    Add-Err "카드 '$($c.id)' 의 category='$($c.category)' 가 어댑터 cardCategories 에 없습니다. 가능: $($cardCatIds -join ', ')"
  }
  if (@("core","normal") -notcontains $c.priority) {
    Add-Err "카드 '$($c.id)' 의 priority='$($c.priority)' - core 또는 normal 이어야 합니다."
  }
  if ($c.priority -eq "core") { $coreN++ }
  if (Is-Filled $c.conceptId) {
    if ($modIds -notcontains $c.conceptId) { Add-Err "카드 '$($c.id)' 의 conceptId='$($c.conceptId)' 에 해당하는 모듈이 없습니다." }
  } else {
    $noConcept++
  }
}
foreach ($d in @($cardIds | Group-Object | Where-Object { $_.Count -gt 1 })) {
  Add-Err "카드 id 중복: '$($d.Name)' ($($d.Count)회) - FSRS 진도가 섞입니다."
}
if ($cards.Count -gt 0) {
  if ($noConcept -gt 0) {
    Add-Warn "카드 $noConcept/$($cards.Count) 장에 conceptId 가 없습니다. 이 카드들은 틀렸을 때 '원문 보기' 버튼이 뜨지 않습니다 - 뽑아온 모듈 id 를 채우면 공짜로 해결됩니다."
  }
  $ratio = [math]::Round(100.0 * $coreN / $cards.Count)
  if ($coreN -eq 0) {
    Add-Warn "core 카드가 하나도 없습니다 - 우선순위가 없는 것과 같습니다."
  } elseif ($ratio -gt 50) {
    Add-Warn "core 카드가 $coreN/$($cards.Count) ($ratio%) 입니다. 2할 안팎이 적당합니다 - 전부 핵심이면 핵심이 없는 셈입니다."
  }
}

# ---- guide -----------------------------------------------------
$steps = @($content.guide.steps)
if ($steps.Count -lt 4 -or $steps.Count -gt 7) { Add-Warn "guide.steps 가 $($steps.Count) 개입니다. 5~6개를 권장합니다." }
$stepMin = 0
foreach ($s in $steps) {
  $stepMin += [int]$s.minutes
  foreach ($l in @($s.links)) {
    if (@("guide","read","study","cards","output") -notcontains $l.tab) {
      Add-Err "guide 단계 $($s.n) 의 link tab='$($l.tab)' 이 유효하지 않습니다."
    }
    if (Is-Filled $l.anchor) {
      if ($l.tab -eq "study" -and $modIds -notcontains $l.anchor) {
        Add-Err "guide 단계 $($s.n) 의 링크가 없는 모듈 '$($l.anchor)' 을 가리킵니다 - 눌러도 아무 일이 없습니다."
      }
      if ($l.tab -eq "read" -and $paraIds -notcontains $l.anchor -and $secIds -notcontains $l.anchor) {
        Add-Err "guide 단계 $($s.n) 의 링크가 없는 문단/섹션 '$($l.anchor)' 을 가리킵니다."
      }
    }
  }
}
if ($content.meta.estimatedMinutes -and $stepMin -gt 0) {
  $est = [int]$content.meta.estimatedMinutes
  if ([math]::Abs($est - $stepMin) -gt $est * 0.3) {
    Add-Warn "guide.steps 의 minutes 합($stepMin 분)이 meta.estimatedMinutes($est 분)와 많이 다릅니다."
  }
}

# ---- output ----------------------------------------------------
if (@("presentation","exam") -notcontains $content.output.mode) {
  Add-Err "output.mode='$($content.output.mode)' - presentation 또는 exam 이어야 합니다."
}
$segs = @($content.output.segments)
if ($segs.Count -eq 0) { Add-Warn "output.segments 가 비어 있습니다 - 리허설 탭이 빈 화면이 됩니다." }
foreach ($s in $segs) {
  if ($s.time -notmatch '^\d+:\d{2}$') { Add-Err "output 세그먼트 '$($s.title)' 의 time='$($s.time)' 형식이 잘못됐습니다 (예: 0:00, 12:30)." }
  if (-not (Is-Filled $s.script))      { Add-Warn "output 세그먼트 '$($s.title)' 에 script 가 없습니다." }
  if (@($s.keywords).Count -eq 0)      { Add-Warn "output 세그먼트 '$($s.title)' 에 keywords 가 없어 암송 모드에서 빈 화면이 됩니다." }
}

# ---- 결과 ------------------------------------------------------
Write-Host ""
Write-Host "검증: $ContentId" -ForegroundColor Cyan
Write-Host ("  섹션 {0} / 문단 {1} / 모듈 {2} / 카드 {3}(core {4}) / 세그먼트 {5}" -f @($content.source.sections).Count, $paraCount, $modIds.Count, $cards.Count, $coreN, $segs.Count)
Write-Host ("  시각자료: diagram {0} / table {1} / figureCard {2} (전체 블록 {3})" -f $blockCount["diagram"], $blockCount["table"], $blockCount["figureCard"], $totalBlocks)
Write-Host ""
foreach ($e in $script:Errors) { Write-Host "  ERROR  $e" -ForegroundColor Red }
foreach ($w in $script:Warns)  { Write-Host "  WARN   $w" -ForegroundColor Yellow }
Write-Host ""
if ($script:Errors.Count -eq 0) {
  Write-Host "오류 0건, 경고 $($script:Warns.Count)건 - 통과" -ForegroundColor Green
  exit 0
} else {
  Write-Host "오류 $($script:Errors.Count)건, 경고 $($script:Warns.Count)건 - 고쳐야 합니다" -ForegroundColor Red
  exit 1
}
