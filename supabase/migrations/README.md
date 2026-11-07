# Migration history

Owner 1 coordinates migration history. Record schema and consumer impact before
writing SQL. Applied migrations are immutable.

The initial hosted setup is explicitly authorized through MCP. Its SQL file
uses the actual version/name returned in Supabase migration history. Subsequent
changes use new additive migrations; do not replay or edit the applied baseline.

For the team's optional CLI workflow, create migrations with
`pnpm exec supabase migration new <name>`.
