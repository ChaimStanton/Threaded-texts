import FilterListIcon from "@mui/icons-material/FilterList";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import LinkIcon from "@mui/icons-material/Link";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Divider,
  FormControlLabel,
  FormControl,
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
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { ComplementCorpus, SefariaText, SourceConnection, fetchSefariaText, fetchSourceConnections } from "./api";

type CorpusFilter = ComplementCorpus | "all";

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

export function App() {
  const [sources, setSources] = useState<SourceConnection[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [query, setQuery] = useState("");
  const [corpus, setCorpus] = useState<CorpusFilter>("all");
  const [minConfidence, setMinConfidence] = useState(0.75);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? sources[0],
    [selectedSourceId, sources]
  );

  const loadSources = async () => {
    setLoading(true);
    setError(null);

    try {
      const nextSources = await fetchSourceConnections({ query, corpus, minConfidence, limit: 100 });
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

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadSources();
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 2 }}>
          <LibraryBooksIcon color="primary" />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography component="h1" variant="h6" sx={{ fontWeight: 700 }}>
              LSJS Sacks Source Library
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Classical sources with connected Rabbi Sacks passages
            </Typography>
          </Box>
          <Tooltip title="Refresh sources">
            <span>
              <IconButton edge="end" aria-label="Refresh sources" onClick={loadSources} disabled={loading}>
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

        <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems="stretch">
          <Paper
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
              </Stack>
            </Box>

            <Divider />

            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {loading ? "Loading" : `${sources.length} sources`}
              </Typography>
            </Box>

            <List disablePadding sx={{ maxHeight: { lg: "calc(100vh - 270px)" }, overflow: "auto" }}>
              {sources.length === 0 ? (
                <EmptyListState />
              ) : (
                sources.map((source) => (
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
                        </Box>
                      }
                    />
                  </ListItemButton>
                ))
              )}
            </List>
          </Paper>

          <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
            {selectedSource ? <SourceDetail source={selectedSource} /> : <EmptyDetailState />}
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}

function SourceDetail({ source }: { source: SourceConnection }) {
  const sourceUrl = source.url || buildSefariaUrl(source.ref);
  const [showSourceText, setShowSourceText] = useState(false);

  return (
    <Stack spacing={3}>
      <Paper elevation={0} sx={{ border: 1, borderColor: "divider", p: { xs: 2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography component="h2" variant="h4" sx={{ fontWeight: 700 }}>
                {source.ref}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                <Chip label={corpusLabels[source.corpus]} color="primary" size="small" />
                {source.book ? <Chip label={source.book} size="small" /> : null}
                {source.category ? <Chip label={source.category} size="small" /> : null}
              </Stack>
            </Box>
            <Button
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              variant="outlined"
              startIcon={<OpenInNewIcon />}
              sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}
            >
              Open Source
            </Button>
          </Stack>

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

          <Collapse in={showSourceText} unmountOnExit>
            <SourceTextPanel refText={source.ref} />
          </Collapse>

          <Divider />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Metric label="Rabbi Sacks passages" value={String(source.connectionCount)} />
            <Metric label="Shown here" value={String(source.passages.length)} />
          </Stack>
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
            <Paper key={passage.id} elevation={0} sx={{ border: 1, borderColor: "divider", p: { xs: 2, md: 2.5 } }}>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "flex-start" }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {passage.book.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {passage.chapter?.title || passage.chapter?.ref || passage.rabbiSacksRef}
                    </Typography>
                  </Box>
                  <Button
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
              </Stack>
            </Paper>
          ))
        )}
      </Stack>
    </Stack>
  );
}

function SourceTextPanel({ refText }: { refText: string }) {
  const [sourceText, setSourceText] = useState<SefariaText | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    setLoadingText(true);
    setTextError(null);
    setSourceText(null);

    fetchSefariaText(refText)
      .then((text) => {
        if (!ignore) {
          setSourceText(text);
        }
      })
      .catch((error) => {
        if (!ignore) {
          setTextError(error instanceof Error ? error.message : "Unable to load Sefaria text");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadingText(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [refText]);

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
