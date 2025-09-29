This already works very well but isn't that useful yet. What I could do to make this cooler:

- **Support all models and configurations**: Create KV cache of popular available models and configurations of openrouter, and add this into the json schema.
- **Support smaller responses** e.g. without tool-call info and without reasoning, or with specified the last file content to be the output
- **Support MCPs** if lmpify uses openrouter oauth provider instead of stripe, I can literally use LMPIFY MCP in LMPIFY in this way. And the prompt may contain MCPs! this is epic.
- **Async MCP** this is the coolest thing to work on! this would allow long-running nested agents. This basically would give rise to nested workflows. GOAT
