import FilterListIcon from "@mui/icons-material/FilterList";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import LinkIcon from "@mui/icons-material/Link";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Divider,
  FormControlLabel,
  FormControl,
  GlobalStyles,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from "@mui/material";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ClassificationProgressBook,
  ComplementCorpus,
  SefariaText,
  SourceConnection,
  fetchClassificationProgress,
  fetchSefariaText,
  fetchSourceConnections
} from "./api";

const HebrewBookReader = lazy(() =>
  import("./HebrewBookReader").then((module) => ({ default: module.HebrewBookReader }))
);

type CorpusFilter = ComplementCorpus | "all";
type RabbiSacksBookFilter = "all" | string;
type ReviewOutcomeFilter = "all" | "accept" | "borderline" | "reject" | "pending" | "failed" | "unreviewed";

const corpusOptions: Array<{ value: CorpusFilter; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "tanach", label: "Tanach" },
  { value: "mishna", label: "Mishnah" },
  { value: "gemara", label: "Gemara" },
  { value: "rambam", label: "Rambam" },
  { value: "shulchan_aruch", label: "Shulchan Aruch" }
];

const corpusLabels: Record<ComplementCorpus, string> = {
  tanach: "Tanach",
  mishna: "Mishnah",
  gemara: "Gemara",
  rambam: "Rambam",
  shulchan_aruch: "Shulchan Aruch"
};

const reviewOutcomeOptions: Array<{ value: ReviewOutcomeFilter; label: string }> = [
  { value: "all", label: "All review outcomes" },
  { value: "accept", label: "Accepted" },
  { value: "borderline", label: "Borderline" },
  { value: "reject", label: "Rejected" },
  { value: "pending", label: "Pending review" },
  { value: "failed", label: "Failed review" },
  { value: "unreviewed", label: "Unreviewed" }
];

const reviewVerdictLabels: Record<string, string> = {
  accept: "Accepted",
  borderline: "Borderline",
  reject: "Rejected"
};

const tanachBookOrder = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "I Samuel",
  "II Samuel",
  "I Kings",
  "II Kings",
  "Isaiah",
  "Jeremiah",
  "Ezekiel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Psalms",
  "Proverbs",
  "Job",
  "Song of Songs",
  "Ruth",
  "Lamentations",
  "Ecclesiastes",
  "Esther",
  "Daniel",
  "Ezra",
  "Nehemiah",
  "I Chronicles",
  "II Chronicles"
];

const tractateOrder = [
  "Berakhot",
  "Peah",
  "Demai",
  "Kilayim",
  "Sheviit",
  "Terumot",
  "Maasrot",
  "Maaser Sheni",
  "Challah",
  "Orlah",
  "Bikkurim",
  "Shabbat",
  "Eruvin",
  "Pesachim",
  "Shekalim",
  "Yoma",
  "Sukkah",
  "Beitzah",
  "Rosh Hashanah",
  "Taanit",
  "Megillah",
  "Moed Katan",
  "Chagigah",
  "Yevamot",
  "Ketubot",
  "Nedarim",
  "Nazir",
  "Sotah",
  "Gittin",
  "Kiddushin",
  "Bava Kamma",
  "Bava Metzia",
  "Bava Batra",
  "Sanhedrin",
  "Makkot",
  "Shevuot",
  "Avodah Zarah",
  "Pirkei Avot",
  "Horayot",
  "Zevachim",
  "Menachot",
  "Chullin",
  "Bekhorot",
  "Arakhin",
  "Temurah",
  "Keritot",
  "Meilah",
  "Tamid",
  "Middot",
  "Kinnim",
  "Keilim",
  "Oholot",
  "Negaim",
  "Parah",
  "Tahorot",
  "Mikvaot",
  "Niddah",
  "Makhshirin",
  "Zavim",
  "Tevul Yom",
  "Yadayim",
  "Oktzin"
];

const mishnehTorahOrder = [
  "Foundations of the Torah",
  "Human Dispositions",
  "Torah Study",
  "Foreign Worship and Customs of the Nations",
  "Repentance",
  "Reading the Shema",
  "Prayer and the Priestly Blessing",
  "Tefillin, Mezuzah and the Torah Scroll",
  "Fringes",
  "Blessings",
  "Circumcision",
  "Sabbath",
  "Eruvin",
  "Rest on the Tenth of Tishrei",
  "Rest on a Holiday",
  "Leavened and Unleavened Bread",
  "Shofar, Sukkah and Lulav",
  "Sheqel Dues",
  "Sanctification of the New Month",
  "Fasts",
  "Scroll of Esther and Hanukkah",
  "Marriage",
  "Divorce",
  "Levirate Marriage and Release",
  "Virgin Maiden",
  "Woman Suspected of Infidelity",
  "Forbidden Intercourse",
  "Forbidden Foods",
  "Slaughter",
  "Oaths",
  "Vows",
  "Nazariteship",
  "Appraisals and Devoted Property",
  "Diverse Species",
  "Gifts to the Poor",
  "Heave Offerings",
  "Tithes",
  "Second Tithes and Fourth Year's Fruit",
  "First Fruits and other Gifts to Priests Outside the Sanctuary",
  "Sabbatical Year and the Jubilee",
  "The Chosen Temple",
  "Vessels of the Sanctuary and Those who Serve Therein",
  "Admission into the Sanctuary",
  "Things Forbidden on the Altar",
  "Sacrificial Procedure",
  "Daily Offerings and Additional Offerings",
  "Sacrifices Rendered Unfit",
  "Service on the Day of Atonement",
  "Trespass",
  "Paschal Offering",
  "Festival Offering",
  "Firstlings",
  "Offerings for Unintentional Transgressions",
  "Offerings for Those with Incomplete Atonement",
  "Substitution",
  "Defilement by a Corpse",
  "Red Heifer",
  "Defilement by Leprosy",
  "Those Who Defile Bed or Seat",
  "Other Sources of Defilement",
  "Defilement of Foods",
  "Vessels",
  "Immersion Pools",
  "Damages to Property",
  "Theft",
  "Robbery and Lost Property",
  "One Who Injures a Person or Property",
  "Murderer and the Preservation of Life",
  "Sales",
  "Ownerless Property and Gifts",
  "Neighbors",
  "Agents and Partners",
  "Slaves",
  "Hiring",
  "Borrowing and Deposit",
  "Creditor and Debtor",
  "Plaintiff and Defendant",
  "Inheritances",
  "The Sanhedrin and the Penalties within their Jurisdiction",
  "Testimony",
  "Rebels",
  "Mourning",
  "Kings and Wars"
];

const shulchanAruchOrder = ["Orach Chayim", "Yoreh De'ah", "Even HaEzer", "Choshen Mishpat"];

const corpusOrder: Record<ComplementCorpus, number> = {
  tanach: 0,
  mishna: 1,
  gemara: 2,
  rambam: 3,
  shulchan_aruch: 4
};

export function App() {
  const [view, setView] = useState<"sources" | "hebrew-books">("sources");

  return view === "hebrew-books" ? (
    <Suspense
      fallback={
        <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ minHeight: "100vh" }}>
          <CircularProgress />
          <Typography color="text.secondary">Opening the Hebrew library</Typography>
        </Stack>
      }
    >
      <HebrewBookReader onBack={() => setView("sources")} />
    </Suspense>
  ) : (
    <SourceLibrary onOpenHebrewBooks={() => setView("hebrew-books")} />
  );
}

function SourceLibrary({ onOpenHebrewBooks }: { onOpenHebrewBooks: () => void }) {
  const isDevMode = import.meta.env.DEV;
  const [sources, setSources] = useState<SourceConnection[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [query, setQuery] = useState("");
  const [corpus, setCorpus] = useState<CorpusFilter>("all");
  const [minConfidence, setMinConfidence] = useState(0.75);
  const [rabbiSacksBook, setRabbiSacksBook] = useState<RabbiSacksBookFilter>("all");
  const [reviewOutcome, setReviewOutcome] = useState<ReviewOutcomeFilter>("accept");
  const [showHebrewOnly, setShowHebrewOnly] = useState(false);
  const [selectedPassageIds, setSelectedPassageIds] = useState<Set<string>>(() => new Set());
  const [adminMode, setAdminMode] = useState(false);
  const [exportingSourceIndex, setExportingSourceIndex] = useState(false);
  const [printingSelectionOnly, setPrintingSelectionOnly] = useState(false);
  const [classificationProgress, setClassificationProgress] = useState<ClassificationProgressBook[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressUpdatedAt, setProgressUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveAdminMode = isDevMode && adminMode;

  const rabbiSacksBookOptions = useMemo(() => getRabbiSacksBookOptions(sources), [sources]);
  const reviewFilteredSources = useMemo(() => filterSourcesByReviewOutcome(sources, reviewOutcome), [sources, reviewOutcome]);
  const languageFilteredSources = useMemo(
    () => (showHebrewOnly ? filterSourcesByPassageLanguage(reviewFilteredSources, "he") : reviewFilteredSources),
    [reviewFilteredSources, showHebrewOnly]
  );
  const displayedSources = useMemo(
    () => sortSourcesByRabbiSacksBook(languageFilteredSources, rabbiSacksBook),
    [languageFilteredSources, rabbiSacksBook]
  );
  const exportSources = useMemo(() => sortSourcesByCanonicalRef(displayedSources), [displayedSources]);
  const selectedExportSources = useMemo(
    () => getSourcesForSelectedPassages(exportSources, selectedPassageIds),
    [exportSources, selectedPassageIds]
  );
  const printSources = printingSelectionOnly ? selectedExportSources : exportSources;
  const selectedPassageCount = selectedPassageIds.size;

  const selectedSource = useMemo(
    () => displayedSources.find((source) => source.id === selectedSourceId) ?? displayedSources[0],
    [selectedSourceId, displayedSources]
  );

  const loadSources = async (nextReviewOutcome = reviewOutcome) => {
    setLoading(true);
    setError(null);

    try {
      const nextSources = await fetchSourceConnections({
        query,
        corpus,
        minConfidence: effectiveAdminMode ? minConfidence : undefined,
        reviewOutcome: nextReviewOutcome,
        limit: 10000
      });
      setSources(nextSources);
      setSelectedSourceId((current) =>
        current && nextSources.some((source) => source.id === current) ? current : nextSources[0]?.id ?? ""
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load source connections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    if (effectiveAdminMode && classificationProgress.length === 0 && !progressLoading) {
      void loadClassificationProgress();
    }
  }, [effectiveAdminMode]);

  useEffect(() => {
    if (!effectiveAdminMode) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadClassificationProgress();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [effectiveAdminMode]);

  useEffect(() => {
    if (!exportingSourceIndex) {
      return;
    }

    const resetExportMode = () => {
      setExportingSourceIndex(false);
      setPrintingSelectionOnly(false);
    };
    window.addEventListener("afterprint", resetExportMode);

    return () => window.removeEventListener("afterprint", resetExportMode);
  }, [exportingSourceIndex]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadSources();
  };

  const loadClassificationProgress = async () => {
    setProgressLoading(true);
    setProgressError(null);

    try {
      setClassificationProgress(await fetchClassificationProgress());
      setProgressUpdatedAt(new Date());
    } catch (nextError) {
      setProgressError(nextError instanceof Error ? nextError.message : "Failed to load classification progress");
    } finally {
      setProgressLoading(false);
    }
  };

  const handleExportSourceIndexPdf = () => {
    setPrintingSelectionOnly(false);
    setExportingSourceIndex(true);
    window.setTimeout(() => window.print(), 150);
  };

  const handlePrintSelectionPdf = () => {
    setPrintingSelectionOnly(true);
    setExportingSourceIndex(true);
    window.setTimeout(() => window.print(), 150);
  };

  const handleTogglePassage = (passageId: string) => {
    setSelectedPassageIds((current) => {
      const next = new Set(current);
      if (next.has(passageId)) {
        next.delete(passageId);
      } else {
        next.add(passageId);
      }
      return next;
    });
  };

  const handleToggleSource = (source: SourceConnection) => {
    const sourcePassageIds = source.passages.map((passage) => passage.id);
    setSelectedPassageIds((current) => {
      const next = new Set(current);
      const allSelected = sourcePassageIds.every((passageId) => next.has(passageId));
      for (const passageId of sourcePassageIds) {
        if (allSelected) {
          next.delete(passageId);
        } else {
          next.add(passageId);
        }
      }
      return next;
    });
  };

  return (
    <Box className={exportingSourceIndex ? "export-source-index" : undefined} sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <GlobalStyles
        styles={{
          ".print-list-area": {
            display: "none"
          },
          "@media print": {
            "@page": {
              size: "A4",
              margin: "14mm"
            },
            "body, #root": {
              background: "#fff !important"
            },
            ".no-print": {
              display: "none !important"
            },
            ".print-area": {
              display: "block !important",
              width: "100% !important"
            },
            ".export-source-index .detail-print-area": {
              display: "none !important"
            },
            ".export-source-index .print-list-area": {
              display: "block !important",
              width: "100% !important"
            },
            ".print-area .MuiPaper-root": {
              border: "0 !important",
              boxShadow: "none !important"
            },
            ".print-break-inside-avoid": {
              breakInside: "avoid",
              pageBreakInside: "avoid"
            },
            ".print-source-title": {
              fontSize: "22pt !important"
            }
          }
        }}
      />
      <AppBar className="no-print" position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 2 }}>
          <LibraryBooksIcon color="primary" />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography component="h1" variant="h6" sx={{ fontWeight: 700 }}>
              Threaded Texts
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connected sources and study passages
            </Typography>
          </Box>
          {effectiveAdminMode ? (
            <>
              <Button
                variant="outlined"
                startIcon={<MenuBookIcon />}
                onClick={onOpenHebrewBooks}
                sx={{ flexShrink: 0, display: { xs: "none", sm: "inline-flex" } }}
              >
                Text library
              </Button>
              <Tooltip title="Read stored texts">
                <IconButton
                  aria-label="Read stored texts"
                  onClick={onOpenHebrewBooks}
                  sx={{ display: { xs: "inline-flex", sm: "none" } }}
                >
                  <MenuBookIcon />
                </IconButton>
              </Tooltip>
            </>
          ) : null}
          {isDevMode ? (
            <FormControlLabel
              control={
                <Switch
                  checked={adminMode}
                  onChange={(event) => setAdminMode(event.target.checked)}
                  inputProps={{ "aria-label": "Admin mode" }}
                />
              }
              label="Admin"
              sx={{ mr: 0, flexShrink: 0 }}
            />
          ) : null}
          <Tooltip title="Refresh sources">
            <span>
              <IconButton edge="end" aria-label="Refresh sources" onClick={() => void loadSources()} disabled={loading}>
                {loading ? <CircularProgress size={22} /> : <RefreshIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {effectiveAdminMode ? (
          <ClassificationProgressDashboard
            rows={classificationProgress}
            loading={progressLoading}
            error={progressError}
            updatedAt={progressUpdatedAt}
            onRefresh={loadClassificationProgress}
          />
        ) : null}

        <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems="stretch">
          <Paper
            className="no-print"
            component="aside"
            elevation={0}
            sx={{
              width: { xs: "100%", lg: 420 },
              border: 1,
              borderColor: "divider",
              alignSelf: "flex-start"
            }}
          >
            <Box component="form" onSubmit={handleSearch} sx={{ p: 2 }}>
              <Stack spacing={2}>
                <TextField
                  label="Search sources"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    )
                  }}
                />
                <Stack direction="row" spacing={1.5}>
                  <FormControl fullWidth>
                    <InputLabel id="corpus-filter-label">Collection</InputLabel>
                    <Select
                      labelId="corpus-filter-label"
                      label="Collection"
                      value={corpus}
                      onChange={(event) => setCorpus(event.target.value as CorpusFilter)}
                    >
                      {corpusOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button type="submit" variant="contained" startIcon={<FilterListIcon />} sx={{ px: 2.5 }}>
                    Apply
                  </Button>
                </Stack>
                <FormControl fullWidth>
                  <InputLabel id="rabbi-sacks-book-label">Sort by Rabbi Sacks book</InputLabel>
                  <Select
                    labelId="rabbi-sacks-book-label"
                    label="Sort by Rabbi Sacks book"
                    value={rabbiSacksBook}
                    onChange={(event) => setRabbiSacksBook(event.target.value)}
                  >
                    <MenuItem value="all">All Rabbi Sacks books</MenuItem>
                    {rabbiSacksBookOptions.map((title) => (
                      <MenuItem key={title} value={title}>
                        {title}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel id="review-outcome-label">Review outcome</InputLabel>
                  <Select
                    native
                    labelId="review-outcome-label"
                    label="Review outcome"
                    value={reviewOutcome}
                    inputProps={{ id: "review-outcome" }}
                    onChange={(event) => {
                      const nextReviewOutcome = event.target.value as ReviewOutcomeFilter;
                      setReviewOutcome(nextReviewOutcome);
                      void loadSources(nextReviewOutcome);
                    }}
                  >
                    {reviewOutcomeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={
                    <Switch
                      checked={showHebrewOnly}
                      onChange={(event) => setShowHebrewOnly(event.target.checked)}
                      inputProps={{ "aria-label": "Show Hebrew passages only" }}
                    />
                  }
                  label="Hebrew passages only"
                  sx={{ alignSelf: "flex-start", m: 0 }}
                />
                {effectiveAdminMode ? (
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        Minimum confidence
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {Math.round(minConfidence * 100)}%
                      </Typography>
                    </Stack>
                    <Slider
                      aria-label="Minimum confidence"
                      value={minConfidence}
                      min={0}
                      max={1}
                      step={0.05}
                      marks={[
                        { value: 0, label: "0%" },
                        { value: 0.75, label: "75%" },
                        { value: 1, label: "100%" }
                      ]}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
                      onChange={(_, value) => setMinConfidence(Array.isArray(value) ? value[0] : value)}
                    />
                  </Box>
                ) : null}
                <Button
                  variant="outlined"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={handleExportSourceIndexPdf}
                  disabled={loading || displayedSources.length === 0}
                >
                  Print Filtered Index
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={handlePrintSelectionPdf}
                  disabled={loading || selectedExportSources.length === 0}
                >
                  Print Selection ({selectedPassageCount})
                </Button>
              </Stack>
            </Box>

            <Divider />

            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {loading ? "Loading" : `${displayedSources.length} sources`}
              </Typography>
            </Box>

            <List disablePadding sx={{ maxHeight: { lg: "calc(100vh - 270px)" }, overflow: "auto" }}>
              {displayedSources.length === 0 ? (
                <EmptyListState />
              ) : (
                displayedSources.map((source) => {
                  const sourcePassageIds = source.passages.map((passage) => passage.id);
                  const selectedInSource = sourcePassageIds.filter((passageId) => selectedPassageIds.has(passageId)).length;

                  return (
                  <ListItemButton
                    key={source.id}
                    selected={selectedSource?.id === source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    alignItems="flex-start"
                    sx={{
                      borderTop: 1,
                      borderColor: "divider",
                      py: 1.5,
                      "&.Mui-selected": {
                        bgcolor: "primary.50"
                      }
                    }}
                  >
                    <Checkbox
                      edge="start"
                      checked={sourcePassageIds.length > 0 && selectedInSource === sourcePassageIds.length}
                      indeterminate={selectedInSource > 0 && selectedInSource < sourcePassageIds.length}
                      tabIndex={-1}
                      disableRipple
                      inputProps={{ "aria-label": `Select ${source.ref}` }}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleSource(source);
                      }}
                      sx={{ mt: -0.5 }}
                    />
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                            {source.ref}
                          </Typography>
                          <Chip label={corpusLabels[source.corpus]} size="small" />
                        </Stack>
                      }
                      secondary={
                        <Box component="span" sx={{ display: "block", mt: 0.75 }}>
                          <Typography component="span" variant="body2" color="text.secondary">
                            {source.connectionCount} Rabbi Sacks {source.connectionCount === 1 ? "passage" : "passages"}
                          </Typography>
                          {source.book || source.category ? (
                            <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block" }}>
                              {[source.book, source.category].filter(Boolean).join(" · ")}
                            </Typography>
                          ) : null}
                          <RabbiSacksBookChips source={source} />
                          <ReviewSummaryChips source={source} />
                          {effectiveAdminMode ? <AdminInline value={`id: ${source.id}`} /> : null}
                        </Box>
                      }
                      primaryTypographyProps={{ component: "div" }}
                      secondaryTypographyProps={{ component: "div" }}
                    />
                  </ListItemButton>
                  );
                })
              )}
            </List>
          </Paper>

          <Box component="main" className="print-area detail-print-area" sx={{ flex: 1, minWidth: 0 }}>
            {selectedSource ? (
              <SourceDetail
                source={selectedSource}
                adminMode={effectiveAdminMode}
                selectedPassageIds={selectedPassageIds}
                onTogglePassage={handleTogglePassage}
              />
            ) : (
              <EmptyDetailState />
            )}
          </Box>
        </Stack>

        <Box className="print-list-area">
          <SourceIndexPrintView
            sources={printSources}
            corpus={corpus}
            rabbiSacksBook={rabbiSacksBook}
            reviewOutcome={reviewOutcome}
            query={query}
            selectionOnly={printingSelectionOnly}
          />
        </Box>
      </Container>
    </Box>
  );
}

function SourceDetail({
  source,
  adminMode,
  selectedPassageIds,
  onTogglePassage
}: {
  source: SourceConnection;
  adminMode: boolean;
  selectedPassageIds: Set<string>;
  onTogglePassage: (passageId: string) => void;
}) {
  const sourceUrl = source.url || buildSefariaUrl(source.ref);
  const [showSourceText, setShowSourceText] = useState(false);
  const [sourceText, setSourceText] = useState<SefariaText | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const supportsLiveSourceText = !import.meta.env.PROD;

  const loadSourceText = async () => {
    setLoadingText(true);
    setTextError(null);

    try {
      const nextSourceText = await fetchSefariaText(source.ref);
      setSourceText(nextSourceText);
      return nextSourceText;
    } catch (error) {
      setTextError(error instanceof Error ? error.message : "Unable to load Sefaria text");
      return null;
    } finally {
      setLoadingText(false);
    }
  };

  useEffect(() => {
    setSourceText(null);
    setTextError(null);
    setShowSourceText(false);
  }, [source.id]);

  useEffect(() => {
    if (showSourceText && !sourceText && !loadingText) {
      void loadSourceText();
    }
  }, [showSourceText, sourceText, loadingText]);

  const handleGeneratePdf = async () => {
    if (!supportsLiveSourceText) {
      window.setTimeout(() => window.print(), 150);
      return;
    }

    setShowSourceText(true);

    if (!sourceText) {
      await loadSourceText();
    }

    window.setTimeout(() => window.print(), 150);
  };

  return (
    <Stack spacing={3}>
      <Paper elevation={0} sx={{ border: 1, borderColor: "divider", p: { xs: 2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography component="h2" variant="h4" className="print-source-title" sx={{ fontWeight: 700 }}>
                {source.ref}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                <Chip label={corpusLabels[source.corpus]} color="primary" size="small" />
                {source.book ? <Chip label={source.book} size="small" /> : null}
                {source.category ? <Chip label={source.category} size="small" /> : null}
              </Stack>
            </Box>
            <Stack className="no-print" direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}>
              <Button
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                variant="outlined"
                startIcon={<OpenInNewIcon />}
              >
                Open Source
              </Button>
              <Button
                variant="contained"
                startIcon={loadingText ? <CircularProgress color="inherit" size={16} /> : <PictureAsPdfIcon />}
                onClick={handleGeneratePdf}
                disabled={loadingText}
              >
                Generate PDF
              </Button>
            </Stack>
          </Stack>

          {supportsLiveSourceText ? (
            <>
              <Box className="no-print">
                <FormControlLabel
                  control={
                    <Switch
                      checked={showSourceText}
                      onChange={(event) => setShowSourceText(event.target.checked)}
                      inputProps={{ "aria-label": "Show source text" }}
                    />
                  }
                  label="Show source text"
                />
              </Box>

              <Collapse in={showSourceText} unmountOnExit>
                <SourceTextPanel sourceText={sourceText} loadingText={loadingText} textError={textError} />
              </Collapse>
            </>
          ) : null}

          <Divider />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Metric label="Rabbi Sacks passages" value={String(source.connectionCount)} />
            <Metric label="Shown here" value={String(source.passages.length)} />
          </Stack>

          {adminMode ? (
            <AdminPanel
              items={[
                ["Source id", source.id],
                ["Source ref", source.ref],
                ["Normalized ref", source.normalizedRef],
                ["Corpus", source.corpus],
                ["Sefaria book", source.book],
                ["Category", source.category],
                ["URL", source.url],
                ["Rabbi Sacks books", getRabbiSacksBookLabel(source)],
                ["Recorded classification cost", formatSourceCost(source)],
                ["Recorded classification tokens", formatSourceTokens(source)]
              ]}
            />
          ) : null}
        </Stack>
      </Paper>

      <Stack spacing={2}>
        <Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>
          Connected Rabbi Sacks Passages
        </Typography>

        {source.passages.length === 0 ? (
          <Paper elevation={0} sx={{ border: 1, borderColor: "divider", p: 3 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              No linked passages yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Once source classification succeeds, Rabbi Sacks passages connected to this source will appear here.
            </Typography>
          </Paper>
        ) : (
          source.passages.map((passage) => (
            <Paper key={passage.id} className="print-break-inside-avoid" elevation={0} sx={{ border: 1, borderColor: "divider", p: { xs: 2, md: 2.5 } }}>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "flex-start" }}>
                  <Checkbox
                    className="no-print"
                    checked={selectedPassageIds.has(passage.id)}
                    inputProps={{ "aria-label": `Select ${passage.rabbiSacksRef}` }}
                    onChange={() => onTogglePassage(passage.id)}
                    sx={{ alignSelf: { xs: "flex-start", md: "flex-start" }, p: 0.5 }}
                  />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {passage.book.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {passage.chapter?.title || passage.chapter?.ref || passage.rabbiSacksRef}
                    </Typography>
                  </Box>
                  <Button
                    className="no-print"
                    href={passage.rabbiSacksUrl}
                    target="_blank"
                    rel="noreferrer"
                    variant="contained"
                    startIcon={<LinkIcon />}
                    sx={{ alignSelf: { xs: "flex-start", md: "center" } }}
                  >
                    Rabbi Sacks
                  </Button>
                </Stack>

                {passage.topic ? <Chip label={passage.topic} size="small" sx={{ alignSelf: "flex-start" }} /> : null}

                {passage.rationale ? (
                  <Typography variant="body2" color="text.secondary">
                    {passage.rationale}
                  </Typography>
                ) : null}

                <Typography
                  variant="body1"
                  sx={{ lineHeight: 1.75 }}
                  dangerouslySetInnerHTML={{ __html: passage.text }}
                />

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={passage.rabbiSacksRef} size="small" variant="outlined" />
                  {typeof passage.confidence === "number" ? (
                    <Chip label={`${Math.round(passage.confidence * 100)}% match`} size="small" variant="outlined" />
                  ) : null}
                  <ReviewChip review={passage.latestReview} />
                </Stack>

                {passage.generatedBy ? (
                  <Typography variant="caption" color="text.secondary">
                    Added with {passage.generatedBy.model} · {passage.generatedBy.promptVersion}
                    {typeof passage.generatedBy.totalTokens === "number" ? ` · ${passage.generatedBy.totalTokens} tokens` : ""}
                    {typeof passage.generatedBy.estimatedCostUsd === "number"
                      ? ` · $${passage.generatedBy.estimatedCostUsd.toFixed(4)}`
                      : ""}
                  </Typography>
                ) : null}

                {adminMode ? (
                  <AdminPanel
                    dense
                    items={[
                      ["Complement id", passage.id],
                      ["Paragraph id", passage.paragraphId],
                      ["Rabbi Sacks ref", passage.rabbiSacksRef],
                      ["Book id", passage.book.id],
                      ["Book slug", passage.book.slug],
                      ["Chapter id", passage.chapter?.id],
                      ["Chapter ref", passage.chapter?.ref],
                      ["Rank", formatAdminValue(passage.rank)],
                      ["Confidence", formatPercent(passage.confidence)],
                      ["Provider", passage.generatedBy?.provider],
                      ["Model", passage.generatedBy?.model],
                      ["Prompt version", passage.generatedBy?.promptVersion],
                      ["Request id", passage.generatedBy?.providerRequestId],
                      ["Input tokens", formatAdminValue(passage.generatedBy?.inputTokens)],
                      ["Output tokens", formatAdminValue(passage.generatedBy?.outputTokens)],
                      ["Total tokens", formatAdminValue(passage.generatedBy?.totalTokens)],
                      ["Estimated cost", formatCurrency(passage.generatedBy?.estimatedCostUsd) ?? "Not recorded"],
                      ["Created", passage.generatedBy?.createdAt],
                      ["Completed", passage.generatedBy?.completedAt],
                      ["Review id", passage.latestReview?.id],
                      ["Review provider", passage.latestReview?.provider],
                      ["Review model", passage.latestReview?.model],
                      ["Review status", passage.latestReview?.status],
                      ["Review verdict", passage.latestReview?.verdict],
                      ["Review score", formatAdminValue(passage.latestReview?.score)],
                      ["Review request id", passage.latestReview?.providerRequestId],
                      ["Review rationale", passage.latestReview?.rationale],
                      ["Suggested action", passage.latestReview?.suggestedAction],
                      ["Suggested ref", passage.latestReview?.suggestedRef],
                      ["Review cost", formatCurrency(passage.latestReview?.estimatedCostUsd) ?? "Not recorded"]
                    ]}
                  />
                ) : null}
              </Stack>
            </Paper>
          ))
        )}
      </Stack>
    </Stack>
  );
}

function SourceTextPanel({
  sourceText,
  loadingText,
  textError
}: {
  sourceText: SefariaText | null;
  loadingText: boolean;
  textError: string | null;
}) {
  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: "divider", bgcolor: "grey.50", p: 2 }}>
      {loadingText ? (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Loading source text
          </Typography>
        </Stack>
      ) : textError ? (
        <Alert severity="warning">{textError}</Alert>
      ) : sourceText ? (
        <Stack spacing={1.5}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {sourceText.ref}
          </Typography>
          <SourceTextBlock value={sourceText.text} />
        </Stack>
      ) : null}
    </Paper>
  );
}

function SourceTextBlock({ value }: { value?: string | string[] }) {
  const items = Array.isArray(value) ? value : value ? [value] : [];

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No English source text was returned for this ref.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {items.map((item, index) => (
        <Typography key={`${index}-${item.slice(0, 24)}`} variant="body1" sx={{ lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: item }} />
      ))}
    </Stack>
  );
}

function SourceIndexPrintView({
  sources,
  corpus,
  rabbiSacksBook,
  reviewOutcome,
  query,
  selectionOnly
}: {
  sources: SourceConnection[];
  corpus: CorpusFilter;
  rabbiSacksBook: RabbiSacksBookFilter;
  reviewOutcome: ReviewOutcomeFilter;
  query: string;
  selectionOnly: boolean;
}) {
  const printedAt = new Date().toLocaleDateString();

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography component="h2" variant="h4" sx={{ fontWeight: 700 }}>
          {selectionOnly ? "Threaded Texts Selected Source Links" : "Threaded Texts Source Link Index"}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Classical sources listed with connected study passages
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
          <Chip label={`${sources.length} sources`} size="small" />
          <Chip label={`Collection: ${corpus === "all" ? "All sources" : corpusLabels[corpus]}`} size="small" />
          <Chip label={`Rabbi Sacks book: ${rabbiSacksBook === "all" ? "All books" : rabbiSacksBook}`} size="small" />
          <Chip label={`Review: ${getReviewOutcomeLabel(reviewOutcome)}`} size="small" />
          {query.trim() ? <Chip label={`Search: ${query.trim()}`} size="small" /> : null}
          <Chip label={`Exported: ${printedAt}`} size="small" />
        </Stack>
      </Box>

      {sources.map((source) => (
        <Paper key={source.id} className="print-break-inside-avoid" elevation={0} sx={{ border: 1, borderColor: "divider", p: 2 }}>
          <Stack spacing={1.25}>
            <Box>
              <Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>
                {source.ref}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {[corpusLabels[source.corpus], source.book, source.category].filter(Boolean).join(" / ")}
              </Typography>
              <Typography
                component="a"
                href={source.url || buildSefariaUrl(source.ref)}
                variant="body2"
                sx={{ color: "primary.main", overflowWrap: "anywhere" }}
              >
                {source.url || buildSefariaUrl(source.ref)}
              </Typography>
            </Box>

            <Divider />

            <Stack spacing={1}>
              {source.passages.map((passage) => (
                <Box key={passage.id}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {passage.book.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {passage.chapter?.title || passage.chapter?.ref || passage.rabbiSacksRef}
                  </Typography>
                  <Typography
                    component="a"
                    href={passage.rabbiSacksUrl}
                    variant="body2"
                    sx={{ color: "primary.main", overflowWrap: "anywhere" }}
                  >
                    {passage.rabbiSacksRef}
                  </Typography>
                  {passage.topic || passage.rationale ? (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {[passage.topic, passage.rationale].filter(Boolean).join(": ")}
                    </Typography>
                  ) : null}
                  {passage.latestReview ? (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      Review: {formatReviewLabel(passage.latestReview)}
                      {passage.latestReview.rationale ? ` - ${passage.latestReview.rationale}` : ""}
                    </Typography>
                  ) : null}
                </Box>
              ))}
            </Stack>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 160 }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

function ClassificationProgressDashboard({
  rows,
  loading,
  error,
  updatedAt,
  onRefresh
}: {
  rows: ClassificationProgressBook[];
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  onRefresh: () => void;
}) {
  const totals = rows.reduce(
    (current, row) => ({
      eligibleParas: current.eligibleParas + row.eligibleParas,
      completedClassification: current.completedClassification + row.completedClassification,
      stillNeedsClassification: current.stillNeedsClassification + row.stillNeedsClassification,
      suggestedLinks: current.suggestedLinks + row.suggestedLinks,
      qaReviewedLinks: current.qaReviewedLinks + row.qaReviewedLinks,
      linksNeedingQa: current.linksNeedingQa + row.linksNeedingQa
    }),
    {
      eligibleParas: 0,
      completedClassification: 0,
      stillNeedsClassification: 0,
      suggestedLinks: 0,
      qaReviewedLinks: 0,
      linksNeedingQa: 0
    }
  );

  return (
    <Paper className="no-print" elevation={0} sx={{ border: 1, borderColor: "divider", mb: 3, overflow: "hidden" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", md: "center" }}
        justifyContent="space-between"
        sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <Box>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
            Classification Progress
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Initial Sefaria complement classification and QA coverage for tracked Rabbi Sacks books
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            Live refresh every 30 seconds{updatedAt ? `; last updated ${updatedAt.toLocaleTimeString()}` : ""}
          </Typography>
        </Box>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent={{ xs: "space-between", md: "flex-end" }}
          useFlexGap
          flexWrap="wrap"
        >
          <Chip label={`${formatInteger(totals.stillNeedsClassification)} classifications left`} color={totals.stillNeedsClassification ? "warning" : "success"} />
          <Chip label={`${formatInteger(totals.linksNeedingQa)} QA left`} color={totals.linksNeedingQa ? "warning" : "success"} variant="outlined" />
          <Tooltip title="Refresh classification progress">
            <span>
              <IconButton aria-label="Refresh classification progress" onClick={onRefresh} disabled={loading}>
                {loading ? <CircularProgress size={22} /> : <RefreshIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      ) : null}

      <TableContainer>
        <Table size="small" sx={{ minWidth: 980 }}>
          <TableHead>
            <TableRow>
              <TableCell>Book</TableCell>
              <TableCell align="right">Eligible paras</TableCell>
              <TableCell align="right">Completed classification</TableCell>
              <TableCell align="right">Still needs classification</TableCell>
              <TableCell align="right">Suggested links</TableCell>
              <TableCell align="right">QA-reviewed links</TableCell>
              <TableCell align="right">Links needing QA</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.bookId} hover>
                <TableCell sx={{ minWidth: 260 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {row.title}
                  </Typography>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <ProgressLine
                      label="Classification"
                      value={row.completedClassification}
                      total={row.eligibleParas}
                      color={row.stillNeedsClassification ? "warning.main" : "success.main"}
                    />
                    <ProgressLine
                      label="QA"
                      value={row.qaReviewedLinks}
                      total={row.suggestedLinks}
                      color={row.linksNeedingQa ? "warning.main" : "success.main"}
                    />
                  </Stack>
                </TableCell>
                <TableCell align="right">{formatInteger(row.eligibleParas)}</TableCell>
                <TableCell align="right">{formatInteger(row.completedClassification)}</TableCell>
                <TableCell align="right">
                  <StatusNumber value={row.stillNeedsClassification} />
                </TableCell>
                <TableCell align="right">{formatInteger(row.suggestedLinks)}</TableCell>
                <TableCell align="right">{formatInteger(row.qaReviewedLinks)}</TableCell>
                <TableCell align="right">
                  <StatusNumber value={row.linksNeedingQa} />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No progress rows loaded.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

function ProgressLine({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" spacing={1}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {percent}%
        </Typography>
      </Stack>
      <Box sx={{ height: 6, bgcolor: "grey.200", borderRadius: 999, overflow: "hidden" }}>
        <Box sx={{ width: `${Math.min(percent, 100)}%`, height: "100%", bgcolor: color }} />
      </Box>
    </Box>
  );
}

function StatusNumber({ value }: { value: number }) {
  return (
    <Typography component="span" variant="body2" color={value > 0 ? "warning.main" : "success.main"} sx={{ fontWeight: 700 }}>
      {formatInteger(value)}
    </Typography>
  );
}

function AdminInline({ value }: { value: string }) {
  return (
    <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block", fontFamily: "monospace", mt: 0.5 }}>
      {value}
    </Typography>
  );
}

function RabbiSacksBookChips({ source }: { source: SourceConnection }) {
  const bookTitles = getRabbiSacksBookTitles(source);

  if (bookTitles.length === 0) {
    return null;
  }

  return (
    <Box component="span" sx={{ display: "block", mt: 0.75 }}>
      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Rabbi Sacks {bookTitles.length === 1 ? "book" : "books"}
      </Typography>
      <Stack component="span" direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
        {bookTitles.map((title) => (
          <Chip key={title} label={title} size="small" variant="outlined" sx={{ maxWidth: "100%" }} />
        ))}
      </Stack>
    </Box>
  );
}

function ReviewSummaryChips({ source }: { source: SourceConnection }) {
  const counts = getReviewOutcomeCounts(source);
  const entries = Object.entries(counts).filter(([outcome, count]) => outcome !== "all" && count > 0);

  if (entries.length === 0) {
    return null;
  }

  return (
    <Box component="span" sx={{ display: "block", mt: 0.75 }}>
      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        AI review
      </Typography>
      <Stack component="span" direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
        {entries.map(([outcome, count]) => (
          <Chip key={outcome} label={`${getReviewOutcomeLabel(outcome as ReviewOutcomeFilter)}: ${count}`} size="small" variant="outlined" />
        ))}
      </Stack>
    </Box>
  );
}

function ReviewChip({ review }: { review: SourceConnection["passages"][number]["latestReview"] }) {
  if (!review) {
    return <Chip label="Unreviewed" size="small" variant="outlined" />;
  }

  return <Chip label={formatReviewLabel(review)} size="small" color={getReviewColor(review)} variant={review.verdict ? "filled" : "outlined"} />;
}

function AdminPanel({ items, dense = false }: { items: Array<[string, string | number | undefined | null]>; dense?: boolean }) {
  const visibleItems = items.filter(([, value]) => value !== undefined && value !== null && value !== "");

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: "divider", bgcolor: "grey.50", p: dense ? 1.5 : 2 }}>
      <Stack spacing={dense ? 0.5 : 0.75}>
        {visibleItems.map(([label, value]) => (
          <Box
            key={label}
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: { xs: "1fr", sm: "150px minmax(0, 1fr)" }
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

function EmptyListState() {
  return (
    <Box sx={{ borderTop: 1, borderColor: "divider", p: 3 }}>
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        No source connections
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
        The source index will populate after successful Sefaria complement classification.
      </Typography>
    </Box>
  );
}

function EmptyDetailState() {
  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: "divider", p: 4 }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        Select a source
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
        Sources appear here when connected Rabbi Sacks passages are available.
      </Typography>
    </Paper>
  );
}

function buildSefariaUrl(ref: string) {
  return `https://www.sefaria.org/${ref.replaceAll(" ", "_").replaceAll(":", ".")}?lang=bi`;
}

function sortSourcesByRabbiSacksBook(sources: SourceConnection[], rabbiSacksBook: RabbiSacksBookFilter) {
  const filteredSources =
    rabbiSacksBook === "all"
      ? sources
      : sources.filter((source) => getRabbiSacksBookTitles(source).includes(rabbiSacksBook));

  return [...filteredSources].sort(
    (left, right) =>
      getRabbiSacksBookLabel(left).localeCompare(getRabbiSacksBookLabel(right), undefined, { sensitivity: "base" }) ||
      left.ref.localeCompare(right.ref, undefined, { sensitivity: "base" })
  );
}

function filterSourcesByReviewOutcome(sources: SourceConnection[], reviewOutcome: ReviewOutcomeFilter) {
  if (reviewOutcome === "all") {
    return sources;
  }

  return sources
    .map((source) => ({
      ...source,
      passages: source.passages.filter((passage) => matchesReviewOutcome(passage.latestReview, reviewOutcome))
    }))
    .map((source) => ({ ...source, connectionCount: source.passages.length }))
    .filter((source) => source.passages.length > 0);
}

function filterSourcesByPassageLanguage(sources: SourceConnection[], language: string) {
  return sources
    .map((source) => {
      const passages = source.passages.filter((passage) => passage.language === language);
      return { ...source, connectionCount: passages.length, passages };
    })
    .filter((source) => source.passages.length > 0);
}

function getSourcesForSelectedPassages(sources: SourceConnection[], selectedPassageIds: Set<string>) {
  return sources
    .map((source) => {
      const selectedPassages = source.passages.filter((passage) => selectedPassageIds.has(passage.id));
      return {
        ...source,
        connectionCount: selectedPassages.length,
        passages: selectedPassages
      };
    })
    .filter((source) => source.passages.length > 0);
}

function matchesReviewOutcome(
  review: SourceConnection["passages"][number]["latestReview"],
  reviewOutcome: ReviewOutcomeFilter
) {
  if (reviewOutcome === "unreviewed") {
    return !review;
  }

  if (!review) {
    return false;
  }

  if (reviewOutcome === "pending" || reviewOutcome === "failed") {
    return review.status === reviewOutcome;
  }

  return review.verdict === reviewOutcome;
}

function getReviewOutcomeCounts(source: SourceConnection) {
  return source.passages.reduce<Record<ReviewOutcomeFilter, number>>(
    (counts, passage) => {
      const outcome = getReviewOutcome(passage.latestReview);
      counts[outcome] += 1;
      return counts;
    },
    { all: source.passages.length, accept: 0, borderline: 0, reject: 0, pending: 0, failed: 0, unreviewed: 0 }
  );
}

function getReviewOutcome(review: SourceConnection["passages"][number]["latestReview"]): ReviewOutcomeFilter {
  if (!review) {
    return "unreviewed";
  }

  if (review.status === "pending" || review.status === "failed") {
    return review.status;
  }

  return review.verdict ?? "unreviewed";
}

function getReviewOutcomeLabel(reviewOutcome: ReviewOutcomeFilter) {
  return reviewOutcomeOptions.find((option) => option.value === reviewOutcome)?.label ?? reviewOutcome;
}

function formatReviewLabel(review: NonNullable<SourceConnection["passages"][number]["latestReview"]>) {
  const outcome = review.verdict ? reviewVerdictLabels[review.verdict] ?? review.verdict : getReviewOutcomeLabel(getReviewOutcome(review));
  return typeof review.score === "number" ? `${outcome} (${review.score}/4)` : outcome;
}

function getReviewColor(review: NonNullable<SourceConnection["passages"][number]["latestReview"]>) {
  if (review.verdict === "accept") {
    return "success";
  }

  if (review.verdict === "reject" || review.status === "failed") {
    return "error";
  }

  if (review.verdict === "borderline" || review.status === "pending") {
    return "warning";
  }

  return "default";
}

function sortSourcesByCanonicalRef(sources: SourceConnection[]) {
  return [...sources].sort((left, right) => compareCanonicalSourceOrder(left, right));
}

function compareCanonicalSourceOrder(left: SourceConnection, right: SourceConnection) {
  const leftKey = getCanonicalSourceSortKey(left);
  const rightKey = getCanonicalSourceSortKey(right);

  return (
    leftKey.corpus - rightKey.corpus ||
    leftKey.work - rightKey.work ||
    leftKey.section - rightKey.section ||
    leftKey.segment - rightKey.segment ||
    left.ref.localeCompare(right.ref, undefined, { numeric: true, sensitivity: "base" })
  );
}

function getCanonicalSourceSortKey(source: SourceConnection) {
  const corpus = corpusOrder[source.corpus] ?? 99;
  const work = getCanonicalWorkOrder(source);
  const [section, segment] = getRefNumbers(source.ref, source.corpus);

  return { corpus, work, section, segment };
}

function getCanonicalWorkOrder(source: SourceConnection) {
  if (source.corpus === "tanach") {
    return getOrderIndex(tanachBookOrder, normalizeSourceBookName(source.book || getLeadingRefTitle(source.ref)));
  }

  if (source.corpus === "mishna" || source.corpus === "gemara") {
    return getOrderIndex(tractateOrder, normalizeSourceBookName(source.book || getLeadingRefTitle(source.ref)));
  }

  if (source.corpus === "rambam") {
    return getOrderIndex(mishnehTorahOrder, stripKnownPrefix(getLeadingRefTitle(source.ref), "Mishneh Torah"));
  }

  if (source.corpus === "shulchan_aruch") {
    return getOrderIndex(shulchanAruchOrder, stripKnownPrefix(getLeadingRefTitle(source.ref), "Shulchan Arukh"));
  }

  return 999;
}

function getRefNumbers(ref: string, corpus: ComplementCorpus) {
  if (corpus === "gemara") {
    const dafMatch = ref.match(/\b(\d+)([ab])(?::(\d+))?/i);
    if (dafMatch) {
      const daf = Number(dafMatch[1]);
      const side = dafMatch[2].toLowerCase() === "b" ? 1 : 0;
      const segment = dafMatch[3] ? Number(dafMatch[3]) : 0;
      return [daf * 2 + side, segment];
    }
  }

  const numbers = ref.match(/\d+/g)?.map(Number) ?? [];
  return [numbers[0] ?? 0, numbers[1] ?? 0];
}

function getLeadingRefTitle(ref: string) {
  return ref.split(/\s+\d|:/)[0].trim();
}

function stripKnownPrefix(value: string, prefix: string) {
  return value.replace(new RegExp(`^${escapeRegExp(prefix)},?\\s*`, "i"), "").trim();
}

function normalizeSourceBookName(value: string) {
  return value
    .replace(/^1\s+/, "I ")
    .replace(/^2\s+/, "II ")
    .replace(/^3\s+/, "III ")
    .replace(/^First\s+/i, "I ")
    .replace(/^Second\s+/i, "II ")
    .replace(/^Third\s+/i, "III ")
    .trim();
}

function getOrderIndex(order: string[], value: string) {
  const normalizedValue = normalizeForOrder(value);
  const index = order.findIndex((item) => normalizeForOrder(item) === normalizedValue);
  return index === -1 ? 999 : index;
}

function normalizeForOrder(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRabbiSacksBookOptions(sources: SourceConnection[]) {
  return Array.from(new Set(sources.flatMap((source) => getRabbiSacksBookTitles(source)))).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );
}

function getRabbiSacksBookLabel(source: SourceConnection) {
  const bookTitles = getRabbiSacksBookTitles(source);
  return bookTitles.length > 0 ? bookTitles.join(" / ") : "Unassigned";
}

function getRabbiSacksBookTitles(source: SourceConnection) {
  return Array.from(new Set(source.passages.map((passage) => passage.book.title).filter(Boolean)));
}

function formatPercent(value?: number) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : undefined;
}

function formatCurrency(value?: number) {
  return typeof value === "number" ? `$${value.toFixed(4)}` : undefined;
}

function formatSourceCost(source: SourceConnection) {
  const costs = source.passages
    .map((passage) => passage.generatedBy?.estimatedCostUsd)
    .filter((cost): cost is number => typeof cost === "number");

  return costs.length > 0 ? `$${costs.reduce((total, cost) => total + cost, 0).toFixed(4)}` : "Not recorded";
}

function formatSourceTokens(source: SourceConnection) {
  const tokenCounts = source.passages
    .map((passage) => passage.generatedBy?.totalTokens)
    .filter((tokens): tokens is number => typeof tokens === "number");

  return tokenCounts.length > 0 ? String(tokenCounts.reduce((total, tokens) => total + tokens, 0)) : "Not recorded";
}

function formatAdminValue(value?: string | number | null) {
  return value === undefined || value === null ? undefined : String(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
