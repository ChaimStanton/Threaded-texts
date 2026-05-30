import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1f5f5b"
    },
    secondary: {
      main: "#8a4b2a"
    },
    background: {
      default: "#f7f8f6"
    }
  },
  shape: {
    borderRadius: 6
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
