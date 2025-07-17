This implementation demonstrates using /chat/completions as a tool uses progress notifications that show the intermittend generated tokens amount and a mesasge until the full chat completions answer has arrived.

My aim was to see if it's possible to also show intermediate tool results in the client somehow, but this seems not to be possible yet, but I found some related issues / PRs that may make this possible:

https://github.com/modelcontextprotocol/modelcontextprotocol/issues/484

- by sending multiple responses (if `_meta.allowPartial:true`): https://github.com/modelcontextprotocol/modelcontextprotocol/pull/776
- delta in progress notification (if `_meta.partialResults:true`): https://github.com/modelcontextprotocol/modelcontextprotocol/pull/383
