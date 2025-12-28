# TODO

## Tool Description Clarification - Result Limits (RESOLVED)

- [x] Investigate why Claude Desktop reports a hardcoded limit of 16 results
  - **Finding:** There is no limit. The "16" was coincidental - it's the actual count of kanji with the "fire" radical in the database.
  - Example: `rem=fire` returns exactly 16 kanji because that's how many fire-radical kanji exist in Japanese elementary school curriculum
  - The API returns **all** matching results without pagination

- [ ] Consider adding explicit clarification to tool descriptions that:
  - Results are **not** paginated or limited
  - The API returns all matching kanji in a single response
  - Maximum possible results: ~1,235 kanji (the full database)
  - Individual queries may return fewer results based on how many kanji match the criteria

## Evidence

Query `rem=fire` returned:
```
"results_returned": 16
```

This is the **complete set** of fire-radical kanji in the Kanji Alive database, not a limit.

## Notes

Claude Desktop incorrectly stated: "It appears the Kanji Alive MCP server is limited to returning a maximum of 16 results..."

**Conclusion:** Claude Desktop misinterpreted a coincidental result count as a hardcoded limit. No code changes needed - the server correctly returns all matching results.

---

## Media Links Investigation

- [ ] Investigate how best to provide links to media accessible through the public API:
  - **Audio for compound examples** - pronunciation audio files (opus/aac/ogg formats)
  - **Kanji stroke order animations** - video references for learning stroke order
  - **Other media** - any additional multimedia resources from the API

### Questions to address:
- Should media URLs be prominently displayed in tool output?
- Are the current audio URLs in example words sufficient, or should they be formatted differently?
- How can stroke order animation URLs be made more accessible to users?
- Do media URLs expire or require special handling?

---

## Additional Resources to Include

- [ ] **214 Traditional Kanji Radicals**
  - Source: https://kanjialive.com/214-traditional-kanji-radicals/
  - Add as MCP resource (e.g., `kanjialive://info/radicals`)
  - Would provide comprehensive radical reference beyond just position codes

- [ ] **Supported Textbooks**
  - Source: https://kanjialive.com/supported-textbooks/
  - Add as MCP resource (e.g., `kanjialive://info/textbooks`)
  - Useful for users following specific Japanese language curricula

- [ ] **Background Information**
  - Source: https://kanjialive.com
  - Consider adding general info about:
    - What is Kanji Alive?
    - Educational approach and methodology
    - Kanji learning background/context
  - Could be a `kanjialive://info/about` resource
