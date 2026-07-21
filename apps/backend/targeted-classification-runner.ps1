$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\chaim\Documents\code\lsjsSacks'
$slugs = @(
  'sefaria-not-in-gods-name-confronting-religious-violence-hebrew',
  'sefaria-radical-then-radical-now',
  'sefaria-the-home-we-build-together-recreating-society'
)
function Write-Log($message) {
  Add-Content -Path 'apps\backend\targeted-classification-runner.log' -Value "$(Get-Date -Format o) $message"
}
function QueryScalar($sql) {
  & sqlite3.exe apps\backend\prisma\dev.db $sql
}
Write-Log 'targeted runner starting: model=gpt-5.4 language=he batch=100'
foreach ($slug in $slugs) {
  while ($true) {
    $escapedSlug = $slug.Replace("'", "''")
    $remainingSql = "SELECT count(*) FROM text t JOIN Book b ON b.id=t.bookId LEFT JOIN Chapter c ON c.id=t.chapterId WHERE b.slug='$escapedSlug' AND t.language='he' AND t.isAuxiliary=0 AND t.deletedAt IS NULL AND b.deletedAt IS NULL AND (c.id IS NULL OR c.deletedAt IS NULL) AND (c.id IS NULL OR c.isNonMainText=0) AND NOT EXISTS (SELECT 1 FROM LlmTextClassification l WHERE l.paragraphId=t.paragraphId AND l.deletedAt IS NULL AND l.promptVersion='complementary-sefaria-refs-v1' AND l.status='completed');"
    $remaining = [int](QueryScalar $remainingSql)
    $beforeCompleted = [int](QueryScalar "SELECT count(*) FROM LlmTextClassification WHERE deletedAt IS NULL AND promptVersion='complementary-sefaria-refs-v1' AND status='completed';")
    if ($remaining -le 0) {
      Write-Log "book done: slug=$slug"
      break
    }
    Write-Log "starting batch: slug=$slug remaining=$remaining completed=$beforeCompleted"
    npm --workspace '@lsjs-sacks/backend' run classify:sefaria-complements -- --limit=100 --model=gpt-5.4 --language=he --book-slug=$slug *> 'apps\backend\targeted-classification-last-batch.log'
    $exitCode = $LASTEXITCODE
    $afterCompleted = [int](QueryScalar "SELECT count(*) FROM LlmTextClassification WHERE deletedAt IS NULL AND promptVersion='complementary-sefaria-refs-v1' AND status='completed';")
    $newCompleted = $afterCompleted - $beforeCompleted
    Write-Log "batch finished: slug=$slug exit=$exitCode newCompleted=$newCompleted completed=$afterCompleted"
    if ($exitCode -ne 0) {
      Write-Log "stopping: command failed for slug=$slug"
      exit $exitCode
    }
    if ($newCompleted -le 0) {
      Write-Log "stopping: no new completed rows for slug=$slug"
      exit 1
    }
  }
}
Write-Log 'targeted runner stopped: all requested books complete'
