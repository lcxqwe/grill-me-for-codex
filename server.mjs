import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { z } from 'zod';
import { QuestionStore, questionSchema, answerSchema, questionText } from './questions.mjs';

export const RESOURCE_URI = 'ui://grill-ui/questionnaire.html';
const publicQuestion = question => ({ ...question, options: question.options?.map(({ image, ...option }) => option) });
export function createServer(htmlUrl = new URL('./questionnaire.html', import.meta.url), {
  stateDirectory = process.env.GRILL_UI_STATE_DIR || fileURLToPath(new URL('./state/', import.meta.url)),
} = {}) {
  const store = new QuestionStore({ directory: stateDirectory });
  const server = new McpServer({ name: 'grill-ui', version: '0.3.0' });
  registerAppTool(server, 'ask_question', {
    title: '问卷卡片',
    description: 'Display one inline questionnaire with single/multiple choice, images, ratings, ranking or text. Call during a requested interview. Returns a pending questionId. Immediately call wait_for_answer with that ID in the SAME turn; do not end the turn or send a chat message while awaiting the human. Submission completes the waiting tool directly. Questions and committed answers persist locally for 30 days across server restarts. For interrupted interviews restore the exact questionId from THIS chat with resume_question, instead of creating a duplicate or selecting another chat’s most recent question.',
    inputSchema: questionSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ['model', 'app'] }, 'openai/outputTemplate': RESOURCE_URI,
      'openai/ui': { availableDisplayModes: ['inline'], preferredDisplayMode: 'inline' } },
  }, async input => {
    const question = store.create(input);
    return { content: [{ type: 'text', text: questionText(question) }], structuredContent: { question: publicQuestion(question), status: 'pending' }, _meta: { question } };
  });
  registerAppTool(server, 'resume_question', {
    title: '恢复问卷卡片',
    description: 'Restore the exact questionnaire from the current chat after restart, cancellation or interruption. Use its questionId from this chat history. Re-displays pending or submitted state without creating a question or new user message. If pending, immediately call wait_for_answer in the same turn; if answered/skipped, use the verified saved answer. Never guess an ID or resume a different chat’s question.',
    inputSchema: z.object({ questionId: z.string().uuid() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ['model', 'app'] }, 'openai/outputTemplate': RESOURCE_URI,
      'openai/ui': { availableDisplayModes: ['inline'], preferredDisplayMode: 'inline' } },
  }, async ({ questionId }) => {
    try {
      const result = store.get(questionId);
      return { content: [{ type: 'text', text: JSON.stringify({ status: result.status, answer: result.answer }) }],
        structuredContent: { ...result, question: publicQuestion(result.question) }, _meta: { question: result.question } };
    } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
  });
  server.registerTool('wait_for_answer', {
    title: '等待问卷回答',
    description: 'Wait for a real human answer to a previously displayed question. Call immediately after ask_question, without ending the turn. A submitted answer returns directly as this tool result; no new user message is needed. If status is pending after the bounded interval, call again without sending repetitive commentary or assuming an answer.',
    inputSchema: z.object({ questionId: z.string().uuid(), timeoutSeconds: z.number().int().min(1).max(55).default(55) }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ questionId, timeoutSeconds }, extra) => {
    try {
      const result = await store.wait(questionId, { timeoutMs: timeoutSeconds * 1000, signal: extra?.signal });
      return { content: [{ type: 'text', text: JSON.stringify({ status: result.status, answer: result.answer }) }], structuredContent: { ...result, question: publicQuestion(result.question) } };
    } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
  });
  registerAppTool(server, 'submit_answer', {
    title: '提交问卷答案',
    description: 'Validate and durably commit a human-selected answer locally before reporting success. Duplicate retries of the same answer are idempotent; a different second answer is rejected. For the questionnaire UI, not for generating answers on the human’s behalf.',
    inputSchema: answerSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { visibility: ['app'] } },
  }, async input => {
    try {
      const result = store.submit(input);
      return { content: [{ type: 'text', text: JSON.stringify(result.answer) }], structuredContent: { ...result, question: publicQuestion(result.question) } };
    } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
  });
  server.registerTool('get_answer', {
    description: 'Read an already submitted answer for recovery or verification. For normal interviews use wait_for_answer after displaying the question. Pending means no human answer yet.',
    inputSchema: z.object({ questionId: z.string().uuid() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { visibility: ['model', 'app'] } },
  }, async ({ questionId }) => {
    try {
      const result = store.get(questionId);
      return { content: [{ type: 'text', text: JSON.stringify({ status: result.status, answer: result.answer }) }], structuredContent: { ...result, question: publicQuestion(result.question) } };
    } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
  });
  registerAppResource(server, '问卷卡片', RESOURCE_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({ contents: [{
    uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: await readFile(htmlUrl, 'utf8'),
    _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } },
      'openai/ui': { availableDisplayModes: ['inline'], preferredDisplayMode: 'inline' } },
  }] }));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createServer().connect(new StdioServerTransport());
}
