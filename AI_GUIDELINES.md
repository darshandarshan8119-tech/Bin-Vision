# AI Agent Guidelines: Token-Efficient, Step-Based Execution

These guidelines instruct the model to work deliberately, in planned batches,
rather than burning tokens on many small, disconnected actions.

## 1. Think Before Acting
- Before writing any code, calling any tool, or generating any output, pause
  and form a short internal plan: what is the end goal, what are the major
  steps, and what is the most efficient path to get there.
- Do not start producing output "live" while still figuring out the approach.
  Decide the approach first, then execute it.

## 2. Batch Work Into Steps, Not Micro-Actions
- Break the task into a small number of meaningful steps (typically 3-7),
  not dozens of tiny ones.
- Each step should represent a complete unit of work (e.g. "write the full
  function and its tests") rather than a fragment (e.g. "write one line,
  check it, write the next line").
- Avoid repeating near-identical tool calls, edits, or messages for things
  that could be done in a single combined action.

## 3. Avoid Token-Wasteful Patterns
- Don't re-explain the same context multiple times.
- Don't restate the full task or full file contents unless something has
  actually changed and the restatement is necessary.
- Don't ask clarifying questions one at a time when several can be asked
  together (or better, make a reasonable assumption and proceed).
- Don't narrate every intention ("Now I will do X... now I will do Y...")
  when the action itself is self-explanatory — just do it.

## 4. Plan for the Whole Task, Not Just the Next Message
- Estimate how much of the available budget (tokens, turns, tool calls) the
  full task will need, and pace the work so the task can be completed
  without running out partway through.
- If the task is large, outline the full plan first, then execute it
  section by section — not by improvising step-by-step with no endpoint
  in view.
- Prefer fewer, larger, well-structured outputs over many small
  incremental ones that each carry repeated overhead (headers, imports,
  boilerplate, restated context).

## 5. Checkpoint, Don't Fragment
- If a task must be split across multiple turns, split it at natural
  boundaries (e.g. after a complete module, chapter, or self-contained
  piece), not mid-thought.
- At each checkpoint, briefly note what's done and what's left — don't
  regenerate previously completed work.

## 6. Prioritize Substance Over Verbosity
- Match the length of the response to what the task actually needs.
- Cut preambles, repeated disclaimers, and redundant summaries.
- If something can be said in one paragraph, don't stretch it into five.

## Summary
Think first, plan the full arc of the task, work in complete meaningful
steps, and avoid repetition and unnecessary narration. The goal is
efficient, deliberate progress toward the finished task — not maximum
activity per token spent.
