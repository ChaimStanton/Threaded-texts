import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FormatSizeIcon from "@mui/icons-material/FormatSize";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  GlobalStyles,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  Toolbar,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import DOMPurify from "dompurify";
import { useEffect, useMemo, useState } from "react";
import { Book, PublicationBook, fetchBooks, fetchPublicationBook } from "./api";

const publicationBookSlugs = [
  "sefaria-arguments-for-the-sake-of-heaven",
  "sefaria-not-in-gods-name-confronting-religious-violence",
  "sefaria-the-home-we-build-together-recreating-society"
] as const;

type ReadingMode = "bilingual" | "english" | "hebrew";
type PublicationTextUnit = PublicationBook["chapters"][number]["textUnits"][number];
type TextRow = {
  ref: string;
  sort: number;
  en?: PublicationTextUnit;
  he?: PublicationTextUnit;
};

export function HebrewBookReader({ onBack }: { onBack: () => void }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [book, setBook] = useState<PublicationBook | null>(null);
  const [activeChapter, setActiveChapter] = useState(1);
  const [readingMode, setReadingMode] = useState<ReadingMode>("bilingual");
  const [showRefs, setShowRefs] = useState(false);
  const [fontSize, setFontSize] = useState(23);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchBooks()
      .then((allBooks) => {
        if (cancelled) return;
        const bySlug = new Map(allBooks.map((candidate) => [candidate.slug, candidate]));
        const publicationBooks = publicationBookSlugs.flatMap((slug) => {
          const candidate = bySlug.get(slug);
          return candidate ? [candidate] : [];
        });
        setBooks(publicationBooks);
        setSelectedBookId(publicationBooks[0]?.id ?? "");
        if (publicationBooks.length !== publicationBookSlugs.length) {
          setError("One or more publication books are unavailable.");
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load books");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedBookId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchPublicationBook(selectedBookId)
      .then((publicationBook) => {
        if (cancelled) return;
        setBook(publicationBook);
        setActiveChapter(publicationBook.chapters[0]?.number ?? 1);
        setReadingMode(getPreferredReadingMode(publicationBook.chapters));
        setProgress(0);
        window.scrollTo({ top: 0 });
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load this book");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBookId]);

  useEffect(() => {
    const updateProgress = () => {
      const available = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(available > 0 ? Math.min(100, Math.max(0, (window.scrollY / available) * 100)) : 0);
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [book]);

  useEffect(() => {
    if (!book) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        const chapterNumber = Number(visible?.target.getAttribute("data-chapter-number"));
        if (chapterNumber) setActiveChapter(chapterNumber);
      },
      { rootMargin: "-18% 0px -70% 0px" }
    );
    const sections = document.querySelectorAll("[data-chapter-number]");
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [book]);

  const chapters = useMemo(
    () =>
      (book?.chapters ?? []).map((chapter) => ({
        ...chapter,
        textUnits: chapter.textUnits.map((unit) => ({
          ...unit,
          text: DOMPurify.sanitize(unit.text, {
            ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "small", "br", "sup", "sub", "span", "p"],
            ALLOWED_ATTR: ["class", "dir", "lang"]
          })
        }))
      })),
    [book]
  );
  const segmentCount = chapters.reduce((total, chapter) => total + chapter.textUnits.length, 0);
  const englishSegmentCount = chapters.reduce(
    (total, chapter) => total + chapter.textUnits.filter((unit) => unit.language === "en").length,
    0
  );
  const hebrewSegmentCount = segmentCount - englishSegmentCount;
  const hasEnglish = englishSegmentCount > 0;
  const hasHebrew = hebrewSegmentCount > 0;

  const goToChapter = (chapterNumber: number) => {
    setActiveChapter(chapterNumber);
    document.getElementById(`hebrew-section-${chapterNumber}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Box className="hebrew-publication" sx={{ minHeight: "100vh" }}>
      <GlobalStyles
        styles={{
          ".hebrew-publication": {
            background:
              "radial-gradient(circle at 8% 4%, rgba(173, 104, 54, .13), transparent 26rem), linear-gradient(135deg, #f4efe3 0%, #fbfaf5 48%, #e8efe9 100%)",
            color: "#24322e"
          },
          ".hebrew-book-text": {
            fontFamily: '"Noto Serif Hebrew", serif'
          },
          ".publication-book-text-en": {
            fontFamily: 'Georgia, "Times New Roman", serif'
          },
          ".hebrew-book-text p": { margin: 0 },
          ".publication-book-text-en p": { margin: 0 },
          ".hebrew-book-text .footnote": { fontSize: ".72em", color: "#5e6c67" },
          ".publication-book-text-en .footnote": { fontSize: ".72em", color: "#5e6c67" },
          ".parallel-text-row:last-child": {
            borderBottom: "0 !important",
            paddingBottom: "0 !important"
          },
          "@media print": {
            "@page": { size: "A4", margin: "17mm 16mm" },
            ".reader-no-print": { display: "none !important" },
            ".hebrew-publication": { background: "#fff !important" },
            ".hebrew-reader-layout": { display: "block !important" },
            ".hebrew-reader-content": { maxWidth: "none !important" },
            ".hebrew-section": { breakBefore: "page", boxShadow: "none !important", border: "0 !important" },
            ".hebrew-section:first-of-type": { breakBefore: "auto" },
            ".hebrew-book-text, .publication-book-text-en": { fontSize: "13.5pt !important", lineHeight: "1.75 !important" },
            ".parallel-text-row": { display: "grid !important", gridTemplateColumns: "1fr 1fr !important", columnGap: "12mm !important" },
            ".hebrew-ref": { display: "none !important" }
          }
        }}
      />

      <AppBar className="reader-no-print" position="sticky" elevation={0} sx={{ bgcolor: "rgba(250,248,240,.94)", color: "#24322e", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(36,50,46,.12)" }}>
        <LinearProgress variant="determinate" value={progress} sx={{ height: 3, bgcolor: "transparent", "& .MuiLinearProgress-bar": { bgcolor: "#a85f32" } }} />
        <Toolbar sx={{ gap: { xs: 1, sm: 2 } }}>
          <Tooltip title="Back to source library">
            <IconButton aria-label="Back to source library" onClick={onBack} edge="start">
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <MenuBookIcon sx={{ color: "#a85f32", display: { xs: "none", sm: "block" } }} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography component="h1" variant="subtitle1" sx={{ fontWeight: 800 }} noWrap>
              Threaded Texts
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", sm: "block" } }}>
              Stored Sefaria editions in source order
            </Typography>
          </Box>
          <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => window.print()} sx={{ display: { xs: "none", md: "inline-flex" } }}>
            Print book
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 } }}>
        <Paper
          className="reader-no-print"
          elevation={0}
          sx={{ mb: 3, p: { xs: 2, md: 2.5 }, bgcolor: "rgba(255,255,255,.72)", border: "1px solid rgba(36,50,46,.12)" }}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} alignItems={{ md: "center" }}>
            <FormControl sx={{ flex: 1, minWidth: 260 }}>
              <InputLabel id="publication-book-label">Book</InputLabel>
              <Select
                labelId="publication-book-label"
                label="Book"
                value={selectedBookId}
                onChange={(event) => setSelectedBookId(event.target.value)}
              >
                {books.map((candidate) => (
                  <MenuItem key={candidate.id} value={candidate.id}>
                    {candidate.heTitle ? `${candidate.heTitle} / ` : ""}{candidate.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Switch checked={showRefs} onChange={(event) => setShowRefs(event.target.checked)} />}
              label="Show exact refs"
              sx={{ m: 0, whiteSpace: "nowrap" }}
            />
            <ToggleButtonGroup
              exclusive
              size="small"
              value={readingMode}
              onChange={(_, value: ReadingMode | null) => {
                if (value) setReadingMode(value);
              }}
              aria-label="Text language mode"
              sx={{ flexShrink: 0 }}
            >
              <ToggleButton value="bilingual" aria-label="Show Hebrew and English" disabled={!hasEnglish || !hasHebrew}>
                Both
              </ToggleButton>
              <ToggleButton value="english" aria-label="Show English only" disabled={!hasEnglish}>
                English
              </ToggleButton>
              <ToggleButton value="hebrew" aria-label="Show Hebrew only" disabled={!hasHebrew}>
                Hebrew
              </ToggleButton>
            </ToggleButtonGroup>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: { md: 240 } }}>
              <FormatSizeIcon color="action" />
              <Slider
                aria-label="Text size"
                value={fontSize}
                min={18}
                max={32}
                step={1}
                onChange={(_, value) => setFontSize(Array.isArray(value) ? value[0] : value)}
              />
              <Typography variant="body2" sx={{ width: 42 }}>{fontSize}px</Typography>
            </Stack>
          </Stack>
        </Paper>

        {error ? <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert> : null}
        {loading && !book ? (
          <Stack alignItems="center" spacing={2} sx={{ py: 12 }}>
            <CircularProgress />
            <Typography color="text.secondary">Loading the edition</Typography>
          </Stack>
        ) : book ? (
          <>
            <Box component="header" dir="ltr" sx={{ textAlign: "center", py: { xs: 4, md: 7 }, px: 2 }}>
              <Typography className="publication-book-text-en" component="h2" sx={{ fontSize: { xs: "2.5rem", md: "4.5rem" }, fontWeight: 700, lineHeight: 1.12, color: "#163f39" }}>
                {book.title}
              </Typography>
              {book.heTitle ? (
                <Typography className="hebrew-book-text" variant="h6" dir="rtl" sx={{ mt: 1.5, color: "#7d4a2c" }}>
                  {book.heTitle}
                </Typography>
              ) : null}
              <Stack direction="row" justifyContent="center" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 3 }}>
                <Chip label={`${chapters.length} sections`} variant="outlined" />
                {englishSegmentCount > 0 ? <Chip label={`${englishSegmentCount.toLocaleString()} English segments`} variant="outlined" /> : null}
                {hebrewSegmentCount > 0 ? <Chip label={`${hebrewSegmentCount.toLocaleString()} Hebrew segments`} variant="outlined" /> : null}
                <Chip label="Complete Sefaria order" variant="outlined" />
              </Stack>
            </Box>

            <FormControl className="reader-no-print" fullWidth sx={{ display: { xs: "flex", lg: "none" }, mb: 2 }}>
              <InputLabel id="mobile-section-label">Section</InputLabel>
              <Select
                labelId="mobile-section-label"
                label="Section"
                value={activeChapter}
                onChange={(event) => goToChapter(Number(event.target.value))}
              >
                {chapters.map((chapter) => (
                  <MenuItem key={chapter.id} value={chapter.number}>
                    {chapter.number}. {getChapterTitle(chapter, readingMode)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack className="hebrew-reader-layout" direction="row" spacing={3} alignItems="flex-start">
              <Paper
                className="reader-no-print"
                component="nav"
                aria-label="Book index"
                elevation={0}
                sx={{ display: { xs: "none", lg: "block" }, width: 330, maxHeight: "calc(100vh - 112px)", position: "sticky", top: 96, overflow: "auto", bgcolor: "rgba(255,255,255,.68)", border: "1px solid rgba(36,50,46,.12)" }}
              >
                <Box sx={{ px: 2.25, pt: 2, pb: 1 }}>
                  <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: ".14em", color: "#a85f32" }}>Full index</Typography>
                </Box>
                <List dense disablePadding>
                  {chapters.map((chapter) => (
                    <ListItemButton key={chapter.id} selected={activeChapter === chapter.number} onClick={() => goToChapter(chapter.number)} sx={{ borderTop: "1px solid rgba(36,50,46,.08)", py: 1.1 }}>
                      <ListItemText
                        primary={`${chapter.number}. ${getChapterTitle(chapter, readingMode)}`}
                        secondary={getChapterSecondaryTitle(chapter, readingMode)}
                        primaryTypographyProps={{
                          className: getChapterDirection(chapter, readingMode) === "rtl" ? "hebrew-book-text" : "publication-book-text-en",
                          dir: getChapterDirection(chapter, readingMode),
                          fontWeight: activeChapter === chapter.number ? 700 : 500
                        }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Paper>

              <Stack className="hebrew-reader-content" component="main" spacing={3} sx={{ flex: 1, minWidth: 0, maxWidth: 900, mx: "auto !important" }}>
                {chapters.map((chapter) => (
                  <Paper
                    id={`hebrew-section-${chapter.number}`}
                    key={chapter.id}
                    className="hebrew-section"
                    data-chapter-number={chapter.number}
                    elevation={0}
                    dir={getChapterDirection(chapter, readingMode)}
                    sx={{ scrollMarginTop: 96, bgcolor: "rgba(255,255,255,.84)", border: "1px solid rgba(36,50,46,.11)", boxShadow: "0 18px 60px rgba(60,46,29,.07)", p: { xs: 2.25, sm: 4, md: 6 } }}
                  >
                    <Box component="header" sx={{ mb: 4, pb: 2.5, borderBottom: "2px solid rgba(168,95,50,.22)" }}>
                      <Typography variant="overline" sx={{ color: "#a85f32", fontWeight: 800 }}>Section {chapter.number}</Typography>
                      <Typography className={getChapterDirection(chapter, readingMode) === "rtl" ? "hebrew-book-text" : "publication-book-text-en"} component="h3" sx={{ mt: .5, fontSize: { xs: "1.8rem", md: "2.4rem" }, fontWeight: 700, lineHeight: 1.25, color: "#163f39" }}>
                        {getChapterTitle(chapter, readingMode)}
                      </Typography>
                      {readingMode === "bilingual" && chapter.heTitle && chapter.title ? (
                        <Typography className="hebrew-book-text" dir="rtl" variant="h6" sx={{ mt: 1, textAlign: "right", color: "#7d4a2c" }}>
                          {chapter.heTitle}
                        </Typography>
                      ) : chapter.heTitle && chapter.title ? (
                        <Typography dir="ltr" variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: "right" }}>{chapter.title}</Typography>
                      ) : null}
                      {showRefs ? <Typography className="hebrew-ref" dir="ltr" variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, overflowWrap: "anywhere", textAlign: "right" }}>{chapter.ref}</Typography> : null}
                    </Box>

                    <ChapterTextRows
                      chapter={chapter}
                      mode={readingMode}
                      showRefs={showRefs}
                      fontSize={fontSize}
                      hasEnglish={hasEnglish}
                      hasHebrew={hasHebrew}
                    />
                  </Paper>
                ))}
              </Stack>
            </Stack>
          </>
        ) : null}
      </Container>
    </Box>
  );
}

function ChapterTextRows({
  chapter,
  mode,
  showRefs,
  fontSize,
  hasEnglish,
  hasHebrew
}: {
  chapter: PublicationBook["chapters"][number];
  mode: ReadingMode;
  showRefs: boolean;
  fontSize: number;
  hasEnglish: boolean;
  hasHebrew: boolean;
}) {
  const rows = getTextRows(chapter, mode);

  if (rows.length === 0) {
    const missingLanguage = mode === "english" ? "English" : "Hebrew";
    return (
      <Alert severity="info" variant="outlined">
        {missingLanguage} text is not stored for this section.
      </Alert>
    );
  }

  if (mode !== "bilingual") {
    return (
      <Stack spacing={2.35}>
        {rows.map((row) => {
          const unit = mode === "english" ? row.en : row.he;
          return unit ? <TextUnitBlock key={unit.paragraphId} unit={unit} showRefs={showRefs} fontSize={fontSize} /> : null;
        })}
      </Stack>
    );
  }

  if (!hasEnglish || !hasHebrew) {
    const fallbackMode: ReadingMode = hasEnglish ? "english" : "hebrew";
    return (
      <Stack spacing={2.35}>
        {getTextRows(chapter, fallbackMode).map((row) => {
          const unit = fallbackMode === "english" ? row.en : row.he;
          return unit ? <TextUnitBlock key={unit.paragraphId} unit={unit} showRefs={showRefs} fontSize={fontSize} /> : null;
        })}
      </Stack>
    );
  }

  return (
    <Stack spacing={2.4}>
      {rows.map((row) => (
        <Box
          key={row.ref}
          className="parallel-text-row"
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" },
            gap: { xs: 1.75, md: 3 },
            pb: 2.4,
            borderBottom: "1px solid rgba(36,50,46,.1)"
          }}
        >
          <ParallelTextCell
            unit={row.en}
            fallbackLabel={hasEnglish ? "English text missing for this ref" : "English not stored for this book"}
            language="en"
            showRefs={showRefs}
            fontSize={fontSize}
            refLabel={row.ref}
          />
          <ParallelTextCell
            unit={row.he}
            fallbackLabel={hasHebrew ? "Hebrew text missing for this ref" : "Hebrew not stored for this book"}
            language="he"
            showRefs={showRefs}
            fontSize={fontSize}
            refLabel={row.ref}
          />
        </Box>
      ))}
    </Stack>
  );
}

function ParallelTextCell({
  unit,
  fallbackLabel,
  language,
  showRefs,
  fontSize,
  refLabel
}: {
  unit?: PublicationTextUnit;
  fallbackLabel: string;
  language: "en" | "he";
  showRefs: boolean;
  fontSize: number;
  refLabel: string;
}) {
  if (!unit) {
    return (
      <Box
        dir={language === "he" ? "rtl" : "ltr"}
        sx={{
          minHeight: 56,
          border: "1px dashed rgba(36,50,46,.22)",
          bgcolor: "rgba(255,255,255,.42)",
          px: 1.5,
          py: 1.25
        }}
      >
        {showRefs ? (
          <Typography className="hebrew-ref" dir="ltr" variant="caption" sx={{ color: "#8b6b57", display: "block", mb: 0.5, overflowWrap: "anywhere" }}>
            {refLabel}
          </Typography>
        ) : null}
        <Typography variant="body2" color="text.secondary">
          {fallbackLabel}
        </Typography>
      </Box>
    );
  }

  return <TextUnitBlock unit={unit} showRefs={showRefs} fontSize={fontSize} />;
}

function TextUnitBlock({
  unit,
  showRefs,
  fontSize
}: {
  unit: PublicationTextUnit;
  showRefs: boolean;
  fontSize: number;
}) {
  return (
    <Box>
      {showRefs ? (
        <Typography
          className="hebrew-ref"
          dir="ltr"
          variant="caption"
          sx={{
            color: "#8b6b57",
            display: "block",
            mb: 0.35,
            textAlign: unit.language === "he" ? "right" : "left",
            overflowWrap: "anywhere"
          }}
        >
          {unit.ref}
        </Typography>
      ) : null}
      <Typography
        className={unit.language === "he" ? "hebrew-book-text" : "publication-book-text-en"}
        component="div"
        dir={unit.language === "he" ? "rtl" : "ltr"}
        lang={unit.language}
        sx={{ fontSize: `${fontSize}px`, lineHeight: 1.9, textAlign: unit.language === "he" ? "right" : "left" }}
        dangerouslySetInnerHTML={{ __html: unit.text }}
      />
    </Box>
  );
}

function getTextRows(chapter: PublicationBook["chapters"][number], mode: ReadingMode) {
  const rowsByRef = new Map<string, TextRow>();

  for (const unit of chapter.textUnits) {
    if (unit.language !== "en" && unit.language !== "he") {
      continue;
    }

    const current = rowsByRef.get(unit.ref) ?? {
      ref: unit.ref,
      sort: unit.verse ?? unit.paragraph
    };

    if (unit.language === "en") {
      current.en = unit;
    } else {
      current.he = unit;
    }

    current.sort = Math.min(current.sort, unit.verse ?? unit.paragraph);
    rowsByRef.set(unit.ref, current);
  }

  return [...rowsByRef.values()]
    .filter((row) => mode === "bilingual" || (mode === "english" ? row.en : row.he))
    .sort((left, right) => left.sort - right.sort || left.ref.localeCompare(right.ref, undefined, { numeric: true }));
}

function getPreferredReadingMode(chapters: PublicationBook["chapters"]) {
  const hasEnglish = chapters.some((chapter) => chapter.textUnits.some((unit) => unit.language === "en"));
  const hasHebrew = chapters.some((chapter) => chapter.textUnits.some((unit) => unit.language === "he"));

  if (hasEnglish && hasHebrew) {
    return "bilingual";
  }

  return hasEnglish ? "english" : "hebrew";
}

function getChapterDirection(chapter: PublicationBook["chapters"][number], mode: ReadingMode) {
  if (mode === "english" || mode === "bilingual") {
    return "ltr";
  }

  return chapter.textUnits.some((unit) => unit.language === "he") ? "rtl" : "ltr";
}

function getChapterTitle(chapter: PublicationBook["chapters"][number], mode: ReadingMode) {
  return getChapterDirection(chapter, mode) === "rtl"
    ? chapter.heTitle || chapter.title || chapter.ref
    : chapter.title || chapter.heTitle || chapter.ref;
}

function getChapterSecondaryTitle(chapter: PublicationBook["chapters"][number], mode: ReadingMode) {
  const secondary = getChapterDirection(chapter, mode) === "rtl" ? chapter.title : chapter.heTitle;
  const primary = getChapterTitle(chapter, mode);

  return secondary && secondary !== primary ? secondary : undefined;
}
