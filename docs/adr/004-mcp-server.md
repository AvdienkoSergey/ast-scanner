# ADR-004: MCP server through stdio

**Status:** Accepted
**Date:** 2025-03-31

## Context

AI agents must be able to call the scanner programmatically. We need to choose a protocol and transport for communication.

## Decision

We build an **MCP server** (Model Context Protocol) with **stdio** transport:

- The server reads JSON-RPC messages from stdin (one per line)
- Answers are written to stdout
- Supported methods: `initialize`, `tools/list`, `tools/call`, `ping`
- Two tools: `scan` (parse + write to database) and `report` (parse + return stats)

## Reasons

- MCP is the standard protocol for connecting tools with AI agents
- stdio is the simplest transport, does not need network, ports, or authentication
- JSON-RPC is the standard format for MCP, works with all MCP clients
- Two tools cover the main use cases: scanning with saving and inspection without side effects

## Alternatives

- **HTTP server**: Harder to set up, needs port management
- **gRPC**: Too much for a single-user CLI tool
- **Native library**: Not compatible with the MCP ecosystem

## Results

- The server is single-user (one process = one client)
- Long scanning operations block processing of other requests
- JSON parsing errors are returned as JSON-RPC errors, they do not crash the server
