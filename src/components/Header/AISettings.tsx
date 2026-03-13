import {
  Box,
  TextField,
  MenuItem,
  CircularProgress,
  Typography,
  Button,
  Link,
  Alert,
} from "@mui/material";
import SmartphoneIcon from "@mui/icons-material/Smartphone";
import { useEffect, useState } from "react";
import { useAppContext } from "../../hooks/useAppContext";
import { aiService } from "../../services/ai-service";
import { isNative } from "../../utils/platform";

const LOCAL_STORAGE_KEY = "ai-settings";
const CONFIG_KEY = "ollama-ai-config";
const DEFAULT_URL = "http://localhost:11434";

// Zapstore link — will be updated when available
const ZAPSTORE_LINK = "https://zapstore.dev/apps/com.formstr.pollerama";

export const AISettings: React.FC = () => {
  const { aiSettings, setAISettings } = useAppContext();

  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_URL);
  const [localModel, setLocalModel] = useState(aiSettings.model || "");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[AISettings] ${msg}`);
    setDebugLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 30));
  };

  // Load saved config on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      if (stored) {
        const config = JSON.parse(stored);
        if (config.url) {
          addLog(`Loaded saved URL: ${config.url}`);
          setOllamaUrl(config.url);
        } else {
          addLog("Saved config has no URL, using default");
        }
      } else {
        addLog(`No saved config, using default: ${DEFAULT_URL}`);
      }
    } catch (e: any) {
      addLog(`Failed to load config: ${e?.message}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fetch models on native (no CORS issues)
  useEffect(() => {
    if (isNative) {
      addLog("Native detected — auto-fetching models on mount");
      fetchModels();
    } else {
      addLog("Not native — skipping auto-fetch");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchModels = async () => {
    setLoading(true);
    setError(null);
    addLog("Fetching models…");
    try {
      const response = await aiService.getModels();
      addLog(`Response: success=${response.success}, error=${response.error ?? "none"}, models=${response.data?.models?.map((m: any) => m.name).join(", ") ?? "none"}`);
      if (
        response.success &&
        response.data &&
        Array.isArray(response.data.models)
      ) {
        setAvailableModels(response.data.models.map((m: any) => m.name));
      } else {
        setError(response.error || "Failed to fetch models.");
      }
    } catch (err: any) {
      addLog(`Exception: ${err?.message}`);
      setError(err?.message || "Failed to communicate with Ollama.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUrl = () => {
    if (!ollamaUrl.trim()) {
      setError("Ollama URL is required");
      return;
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: ollamaUrl.trim() }));
    aiService.updateConfig({ url: ollamaUrl.trim() });
    setAvailableModels([]);
    setLocalModel("");
    fetchModels();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveModel = () => {
    const newSettings = { model: localModel };
    setAISettings(newSettings);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newSettings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // On web, show notice to use the native app
  if (!isNative) {
    return (
      <Box p={2} sx={{ bgcolor: "background.paper", color: "text.primary" }}>
        <Typography variant="h6" gutterBottom>
          AI Settings
        </Typography>
        <Alert icon={<SmartphoneIcon />} severity="info" sx={{ mt: 1 }}>
          <Typography variant="body2" gutterBottom>
            <strong>AI features require the native app.</strong>
          </Typography>
          <Typography variant="body2" gutterBottom>
            Translation and summaries connect directly to your local Ollama
            instance. This is not possible in a browser due to CORS
            restrictions.
          </Typography>
          {ZAPSTORE_LINK ? (
            <Link
              href={ZAPSTORE_LINK}
              target="_blank"
              rel="noopener"
              underline="hover"
            >
              Download from Zapstore
            </Link>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Download link coming soon.
            </Typography>
          )}
        </Alert>
      </Box>
    );
  }

  return (
    <Box p={2} sx={{ bgcolor: "background.paper", color: "text.primary" }}>
      <Typography variant="h6" gutterBottom>
        AI Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Connect to your local{" "}
        <Link
          href="https://ollama.com"
          target="_blank"
          rel="noopener"
          underline="hover"
        >
          Ollama
        </Link>{" "}
        instance for translation and summaries.
      </Typography>

      {/* Ollama URL */}
      <Box mt={2}>
        <TextField
          label="Ollama URL"
          fullWidth
          value={ollamaUrl}
          onChange={(e) => {
            setOllamaUrl(e.target.value);
            setSaved(false);
          }}
          margin="normal"
          placeholder="http://localhost:11434"
          helperText="URL of your local Ollama server"
        />
        <Box mt={1} display="flex" alignItems="center" gap={2}>
          <Button variant="outlined" onClick={handleSaveUrl} disabled={loading}>
            Save & Load Models
          </Button>
          {saved && (
            <Typography variant="body2" color="success.main">
              ✅ Saved
            </Typography>
          )}
        </Box>
      </Box>

      {/* Model Selection */}
      <Box mt={3}>
        <Typography variant="subtitle1" gutterBottom>
          Model
        </Typography>

        {loading ? (
          <Box mt={2} display="flex" alignItems="center">
            <CircularProgress size={20} />
            <Typography variant="body2" ml={1}>
              Loading models from Ollama…
            </Typography>
          </Box>
        ) : availableModels.length > 0 ? (
          <>
            <TextField
              select
              label="Select Model"
              fullWidth
              value={localModel}
              onChange={(e) => {
                setLocalModel(e.target.value);
                setSaved(false);
              }}
              margin="normal"
            >
              {availableModels.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
            <Box mt={2} display="flex" alignItems="center" gap={2}>
              <Button
                variant="contained"
                onClick={handleSaveModel}
                disabled={!localModel}
              >
                Save Model
              </Button>
              {saved && (
                <Typography variant="body2" color="success.main">
                  ✅ Settings saved
                </Typography>
              )}
            </Box>
          </>
        ) : (
          <Typography mt={2} variant="body2" color="text.secondary">
            No models loaded. Make sure Ollama is running and click "Save & Load
            Models".
          </Typography>
        )}
      </Box>

      {/* Error Display */}
      {error && (
        <Box mt={2} p={2} sx={{ bgcolor: "error.dark", borderRadius: 1 }}>
          <Typography color="error.contrastText" variant="body2" gutterBottom>
            {error}
          </Typography>
          <Typography variant="body2" color="error.contrastText" gutterBottom>
            Troubleshooting:
          </Typography>
          <ul
            style={{ margin: "8px 0", paddingLeft: "20px", color: "inherit" }}
          >
            <li>
              <Typography variant="body2" color="error.contrastText">
                Ollama is installed and running
              </Typography>
            </li>
            <li>
              <Typography variant="body2" color="error.contrastText">
                At least one model is pulled (e.g.{" "}
                <code>ollama pull llama3</code>)
              </Typography>
            </li>
            <li>
              <Typography variant="body2" color="error.contrastText">
                The URL above matches your Ollama server address
              </Typography>
            </li>
          </ul>
        </Box>
      )}

      {/* Debug Log */}
      {debugLog.length > 0 && (
        <Box mt={3}>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Debug log
          </Typography>
          <Box
            p={1}
            sx={{
              bgcolor: "action.hover",
              borderRadius: 1,
              maxHeight: 160,
              overflowY: "auto",
              fontFamily: "monospace",
            }}
          >
            {debugLog.map((line, i) => (
              <Typography key={i} variant="caption" display="block" sx={{ fontSize: "0.7rem", lineHeight: 1.4 }}>
                {line}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};
