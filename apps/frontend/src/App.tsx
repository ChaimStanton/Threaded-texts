import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from "@mui/material";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Book,
  Chapter,
  RabbiSacksArticle,
  SourceNote,
  TextUnit,
  createBook,
  createChapter,
  createSourceNote,
  createTextUnit,
  fetchBooks,
  fetchChapters,
  fetchRabbiSacksArticles,
  fetchSourceNotes,
  fetchTextUnits,
  scrapeRabbiSacksArticle
} from "./api";

type View = "sources" | "texts" | "sacks";

export function App() {
  const [view, setView] = useState<View>("sources");
  const [notes, setNotes] = useState<SourceNote[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [units, setUnits] = useState<TextUnit[]>([]);
  const [articles, setArticles] = useState<RabbiSacksArticle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextNotes, nextBooks, nextArticles] = await Promise.all([
        fetchSourceNotes(),
        fetchBooks(),
        fetchRabbiSacksArticles()
      ]);
      setNotes(nextNotes);
      setBooks(nextBooks);
      setArticles(nextArticles);

      const nextSelectedBookId = selectedBookId || nextBooks[0]?.id || "";
      setSelectedBookId(nextSelectedBookId);

      if (nextSelectedBookId) {
        const nextChapters = await fetchChapters(nextSelectedBookId);
        setChapters(nextChapters);
        setSelectedChapterId(nextChapters[0]?.id || "");
        setUnits(await fetchTextUnits(nextSelectedBookId));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const refreshUnits = async (bookId: string) => {
    setSelectedBookId(bookId);
    const nextChapters = bookId ? await fetchChapters(bookId) : [];
    setChapters(nextChapters);
    setSelectedChapterId(nextChapters[0]?.id || "");
    setUnits(bookId ? await fetchTextUnits(bookId) : []);
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static" color="inherit" elevation={0}>
        <Toolbar>
          <Typography component="h1" variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            LSJS Sacks
          </Typography>
          <Tooltip title="Refresh">
            <span>
              <IconButton edge="end" aria-label="Refresh" onClick={loadAll} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Tabs value={view} onChange={(_event, nextView: View) => setView(nextView)} sx={{ mb: 3 }}>
          <Tab value="sources" label="Sources" />
          <Tab value="texts" label="Texts" />
          <Tab value="sacks" label="Rabbi Sacks" />
        </Tabs>

        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

        {view === "sources" ? <SourcesView notes={notes} setNotes={setNotes} setError={setError} /> : null}
        {view === "texts" ? (
          <TextsView
            books={books}
            setBooks={setBooks}
            selectedBookId={selectedBookId}
            units={units}
            chapters={chapters}
            selectedChapterId={selectedChapterId}
            setChapters={setChapters}
            setSelectedChapterId={setSelectedChapterId}
            setUnits={setUnits}
            refreshUnits={refreshUnits}
            setError={setError}
          />
        ) : null}
        {view === "sacks" ? (
          <RabbiSacksView articles={articles} setArticles={setArticles} setError={setError} loading={loading} />
        ) : null}
      </Container>
    </Box>
  );
}

function SourcesView({
  notes,
  setNotes,
  setError
}: {
  notes: SourceNote[];
  setNotes: (notes: SourceNote[] | ((current: SourceNote[]) => SourceNote[])) => void;
  setError: (error: string | null) => void;
}) {
  const [ref, setRef] = useState("Genesis 1:1");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const parsedTags = useMemo(() => tags.split(",").map((tag) => tag.trim()).filter(Boolean), [tags]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const note = await createSourceNote({ ref, title: title || undefined, text: text || undefined, tags: parsedTags });
      setNotes((current) => [note, ...current]);
      setTitle("");
      setText("");
      setTags("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create source note");
    }
  };

  return (
    <TwoColumn
      form={
        <Stack component="form" onSubmit={handleSubmit} spacing={2}>
          <Typography variant="h6">New source note</Typography>
          <TextField label="Reference" value={ref} onChange={(event) => setRef(event.target.value)} required />
          <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <TextField label="Note" value={text} onChange={(event) => setText(event.target.value)} multiline minRows={5} />
          <TextField label="Tags" value={tags} onChange={(event) => setTags(event.target.value)} />
          <Button type="submit" variant="contained" startIcon={<AddIcon />}>Add source</Button>
        </Stack>
      }
      listTitle="Source notes"
      emptyText="No source notes yet"
      items={notes.map((note) => ({
        id: note.id,
        primary: note.title || note.ref,
        secondary: (
          <Stack spacing={1} sx={{ mt: 0.75 }}>
            <Typography component="span" variant="body2" color="text.secondary">{note.ref}</Typography>
            {note.text ? <Typography component="span">{note.text}</Typography> : null}
            {note.tags.length > 0 ? (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {note.tags.map((tag) => <Chip key={tag} label={tag} size="small" />)}
              </Stack>
            ) : null}
          </Stack>
        )
      }))}
    />
  );
}

function TextsView({
  books,
  setBooks,
  selectedBookId,
  units,
  chapters,
  selectedChapterId,
  setChapters,
  setSelectedChapterId,
  setUnits,
  refreshUnits,
  setError
}: {
  books: Book[];
  setBooks: (books: Book[] | ((current: Book[]) => Book[])) => void;
  selectedBookId: string;
  units: TextUnit[];
  chapters: Chapter[];
  selectedChapterId: string;
  setChapters: (chapters: Chapter[] | ((current: Chapter[]) => Chapter[])) => void;
  setSelectedChapterId: (chapterId: string) => void;
  setUnits: (units: TextUnit[] | ((current: TextUnit[]) => TextUnit[])) => void;
  refreshUnits: (bookId: string) => Promise<void>;
  setError: (error: string | null) => void;
}) {
  const [bookTitle, setBookTitle] = useState("Genesis");
  const [bookSlug, setBookSlug] = useState("genesis");
  const [ref, setRef] = useState("Genesis 1:1");
  const [chapter, setChapter] = useState(1);
  const [verse, setVerse] = useState(1);
  const [paragraph, setParagraph] = useState(1);
  const [unitText, setUnitText] = useState("");

  const createParagraphId = () => `${selectedBookId}:${chapter}:${verse}:${paragraph}`;

  const handleCreateBook = async () => {
    setError(null);

    try {
      const book = await createBook({ slug: bookSlug, title: bookTitle });
      setBooks((current) => [...current.filter((item) => item.id !== book.id), book].sort((a, b) => a.title.localeCompare(b.title)));
      await refreshUnits(book.id);
    } catch (bookError) {
      setError(bookError instanceof Error ? bookError.message : "Unable to create book");
    }
  };

  const handleCreateUnit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!selectedBookId) {
      setError("Create or select a book first");
      return;
    }

    try {
      const unit = await createTextUnit({
        paragraphId: createParagraphId(),
        bookId: selectedBookId,
        chapterId: selectedChapterId || undefined,
        chapter,
        verse,
        paragraph,
        ref,
        text: unitText
      });
      setUnits((current) => [...current.filter((item) => item.paragraphId !== unit.paragraphId), unit]);
      setUnitText("");
    } catch (unitError) {
      setError(unitError instanceof Error ? unitError.message : "Unable to create text unit");
    }
  };

  const handleCreateChapter = async () => {
    setError(null);

    if (!selectedBookId) {
      setError("Create or select a book first");
      return;
    }

    try {
      const created = await createChapter({
        bookId: selectedBookId,
        number: chapter,
        ref: `${books.find((book) => book.id === selectedBookId)?.title || "Book"} ${chapter}`
      });
      setChapters((current) => [...current.filter((item) => item.id !== created.id), created].sort((a, b) => a.number - b.number));
      setSelectedChapterId(created.id);
    } catch (chapterError) {
      setError(chapterError instanceof Error ? chapterError.message : "Unable to create chapter");
    }
  };

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
      <Paper elevation={0} sx={{ width: { xs: "100%", md: 400 }, p: 2.5, border: 1, borderColor: "divider" }}>
        <Stack spacing={2}>
          <Typography variant="h6">Text library</Typography>
          <TextField label="Book title" value={bookTitle} onChange={(event) => setBookTitle(event.target.value)} />
          <TextField label="Book slug" value={bookSlug} onChange={(event) => setBookSlug(event.target.value)} />
          <Button variant="outlined" startIcon={<AddIcon />} onClick={handleCreateBook}>Add book</Button>
          <FormControl fullWidth>
            <InputLabel id="book-select-label">Book</InputLabel>
            <Select
              labelId="book-select-label"
              label="Book"
              value={selectedBookId}
              onChange={(event) => void refreshUnits(event.target.value)}
            >
              {books.map((book) => <MenuItem key={book.id} value={book.id}>{book.title}</MenuItem>)}
            </Select>
          </FormControl>
          <Divider />
          <Stack spacing={2}>
            <Typography variant="subtitle1">Chapter lookup</Typography>
            <Stack direction="row" spacing={1}>
              <TextField label="Chapter" type="number" value={chapter} onChange={(event) => setChapter(Number(event.target.value))} required />
              <Button variant="outlined" onClick={handleCreateChapter}>Save chapter</Button>
            </Stack>
            <FormControl fullWidth>
              <InputLabel id="chapter-select-label">Chapter row</InputLabel>
              <Select
                labelId="chapter-select-label"
                label="Chapter row"
                value={selectedChapterId}
                onChange={(event) => setSelectedChapterId(event.target.value)}
              >
                {chapters.map((chapterRow) => (
                  <MenuItem key={chapterRow.id} value={chapterRow.id}>{chapterRow.ref}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <Divider />
          <Stack component="form" onSubmit={handleCreateUnit} spacing={2}>
            <Typography variant="subtitle1">New paragraph</Typography>
            <TextField label="Reference" value={ref} onChange={(event) => setRef(event.target.value)} required />
            <Stack direction="row" spacing={1}>
              <TextField label="Chapter" type="number" value={chapter} onChange={(event) => setChapter(Number(event.target.value))} required />
              <TextField label="Verse" type="number" value={verse} onChange={(event) => setVerse(Number(event.target.value))} />
              <TextField label="Paragraph" type="number" value={paragraph} onChange={(event) => setParagraph(Number(event.target.value))} required />
            </Stack>
            <TextField label="Text" value={unitText} onChange={(event) => setUnitText(event.target.value)} multiline minRows={5} required />
            <Button type="submit" variant="contained" startIcon={<AddIcon />}>Add paragraph</Button>
          </Stack>
        </Stack>
      </Paper>
      <PanelList
        title="Text units"
        emptyText="No text units yet"
        items={units.map((unit) => ({
          id: unit.paragraphId,
          primary: unit.ref,
          secondary: `${unit.text.slice(0, 240)}${unit.text.length > 240 ? "..." : ""}`
        }))}
      />
    </Stack>
  );
}

function RabbiSacksView({
  articles,
  setArticles,
  setError,
  loading
}: {
  articles: RabbiSacksArticle[];
  setArticles: (articles: RabbiSacksArticle[] | ((current: RabbiSacksArticle[]) => RabbiSacksArticle[])) => void;
  setError: (error: string | null) => void;
  loading: boolean;
}) {
  const [sourceUrl, setSourceUrl] = useState("https://www.rabbisacks.org/covenant-conversation/");

  const handleScrape = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const article = await scrapeRabbiSacksArticle(sourceUrl);
      setArticles((current) => [article, ...current.filter((item) => item.id !== article.id)]);
    } catch (scrapeError) {
      setError(scrapeError instanceof Error ? scrapeError.message : "Unable to scrape article");
    }
  };

  return (
    <TwoColumn
      form={
        <Stack component="form" onSubmit={handleScrape} spacing={2}>
          <Typography variant="h6">Scrape article</Typography>
          <TextField label="Rabbi Sacks URL" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required />
          <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={loading}>Scrape</Button>
        </Stack>
      }
      listTitle="Scraped articles"
      emptyText="No Rabbi Sacks articles yet"
      items={articles.map((article) => ({
        id: article.id,
        primary: article.title,
        secondary: `${article.author?.displayName || "Rabbi Lord Jonathan Sacks"} - ${article.excerpt || article.body.slice(0, 180)}`
      }))}
    />
  );
}

function TwoColumn({
  form,
  listTitle,
  emptyText,
  items
}: {
  form: ReactNode;
  listTitle: string;
  emptyText: string;
  items: Array<{ id: string; primary: ReactNode; secondary?: ReactNode }>;
}) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
      <Paper elevation={0} sx={{ width: { xs: "100%", md: 380 }, p: 2.5, border: 1, borderColor: "divider" }}>
        {form}
      </Paper>
      <PanelList title={listTitle} emptyText={emptyText} items={items} />
    </Stack>
  );
}

function PanelList({
  title,
  emptyText,
  items
}: {
  title: string;
  emptyText: string;
  items: Array<{ id: string; primary: ReactNode; secondary?: ReactNode }>;
}) {
  return (
    <Paper elevation={0} sx={{ flex: 1, width: "100%", border: 1, borderColor: "divider" }}>
      <Box sx={{ px: 2.5, py: 2 }}>
        <Typography variant="h6">{title}</Typography>
      </Box>
      <Divider />
      <List disablePadding>
        {items.length === 0 ? (
          <ListItem>
            <ListItemText primary={emptyText} />
          </ListItem>
        ) : (
          items.map((item) => (
            <ListItem key={item.id} alignItems="flex-start" divider>
              <ListItemText primary={item.primary} secondary={item.secondary} />
            </ListItem>
          ))
        )}
      </List>
    </Paper>
  );
}
