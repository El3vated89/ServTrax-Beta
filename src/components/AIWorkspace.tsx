import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Mic, Send, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

type ChatRole = 'assistant' | 'user';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

const QUICK_ACTIONS = [
  { id: 'start-day', label: 'Start my day', prompt: 'Start my day and summarize what needs attention first.' },
  { id: 'draft-quote', label: 'Draft a quote', prompt: 'Help me draft a quote for a customer.' },
  { id: 'message-customer', label: 'Message customer', prompt: 'Draft a customer message about today’s job.' },
  { id: 'find-overdue', label: 'Find overdue jobs', prompt: 'Show me the jobs that are overdue and need follow-up.' },
  { id: 'build-route', label: 'Build route', prompt: 'Help me build a route for today.' },
] as const;

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const initialAssistantMessage = (): ChatMessage => ({
  id: createId(),
  role: 'assistant',
  content:
    "I'm your ServTrax operational workspace. Ask for help with jobs, customers, routes, quotes, and messages. This first screen is set up for planning and guidance, and future action tools can plug into it without changing the layout.",
});

const buildAssistantReply = (prompt: string) => {
  const normalized = prompt.toLowerCase();

  if (normalized.includes('start my day')) {
    return 'A good first pass is: review overdue jobs, check today’s route coverage, surface unpaid completed work, and queue customer messages that need to go out. Once tool actions are connected, this screen can turn that into a one-task-at-a-time workflow.';
  }

  if (normalized.includes('quote')) {
    return 'I can help structure a quote draft here first, then later hand it into the quote workflow with a preview before anything is created or sent.';
  }

  if (normalized.includes('message')) {
    return 'This workspace is ready for message drafting, and it is intentionally set up so future versions can require confirmation before a customer message is actually sent.';
  }

  if (normalized.includes('overdue')) {
    return 'This is the right place to surface overdue work, summarize the risk, and queue follow-up steps before any action is executed.';
  }

  if (normalized.includes('route')) {
    return 'This AI workspace can later become the dispatcher console for route prep, route suggestions, and route-change previews without mixing that logic into the route screens themselves.';
  }

  return 'This workspace is ready to guide planning, drafting, and operational review. Future tool connections can add previews, confirmations, action summaries, and audit history inside this same screen.';
};

export default function AIWorkspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState('');
  const [isResponding, setIsResponding] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [initialAssistantMessage()]);

  const backTarget = useMemo(() => {
    const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
    if (returnTo && returnTo !== '/ai') return returnTo;
    return '/';
  }, [location.state]);

  useEffect(() => {
    const scrollTarget = messagesEndRef.current;
    if (scrollTarget && typeof scrollTarget.scrollIntoView === 'function') {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isResponding]);

  const sendPrompt = (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt || isResponding) return;

    setMessages((current) => [
      ...current,
      {
        id: createId(),
        role: 'user',
        content: prompt,
      },
    ]);
    setDraft('');
    setIsResponding(true);

    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content: buildAssistantReply(prompt),
        },
      ]);
      setIsResponding(false);
    }, 300);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendPrompt(draft);
  };

  return (
    <section className="flex min-h-[calc(100dvh-5rem)] flex-col bg-slate-950 text-white sm:m-6 sm:min-h-[calc(100dvh-8rem)] sm:rounded-[32px] sm:border sm:border-slate-800 sm:shadow-2xl overflow-hidden">
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => navigate(backTarget)}
                className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-200 transition-colors hover:border-slate-700 hover:bg-slate-800"
                aria-label="Back to app"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Workspace
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight sm:text-3xl">AI Dispatcher</h1>
                  <p className="mt-2 max-w-2xl text-sm font-medium text-slate-300 sm:text-base">
                    Ask ServTrax AI to help with jobs, customers, routes, quotes, and messages.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => sendPrompt(action.prompt)}
                className="shrink-0 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-left text-sm font-bold text-slate-100 transition-all hover:border-cyan-400/40 hover:bg-slate-800 hover:text-white"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-[28px] px-4 py-3 sm:max-w-[75%] sm:px-5 sm:py-4 ${
                    message.role === 'user'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'border border-slate-800 bg-slate-900 text-slate-100'
                  }`}
                >
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
                    {message.role === 'user' ? 'You' : 'AI Dispatcher'}
                  </p>
                  <p className="text-sm font-medium leading-6 sm:text-[15px]">{message.content}</p>
                </div>
              </article>
            ))}

            {isResponding && (
              <article className="flex justify-start">
                <div className="max-w-[88%] rounded-[28px] border border-slate-800 bg-slate-900 px-5 py-4 text-slate-100 sm:max-w-[75%]">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] opacity-70">AI Dispatcher</p>
                  <p className="text-sm font-medium text-slate-300">Working on that...</p>
                </div>
              </article>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-slate-800 bg-slate-950/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:px-6 sm:pb-6">
          <div className="mx-auto w-full max-w-4xl">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Preview-first workspace. Future actions can add confirmations, task summaries, and audit history here.
            </p>
            <form onSubmit={handleSubmit} className="flex items-end gap-3">
              <label className="flex-1">
                <span className="sr-only">Message ServTrax AI</span>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  placeholder="Ask ServTrax AI to plan, draft, summarize, or prepare the next step..."
                  className="min-h-[112px] w-full resize-none rounded-[28px] border border-slate-800 bg-slate-900 px-5 py-4 text-base font-medium text-white outline-none transition-all placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                />
              </label>

              <button
                type="button"
                disabled
                aria-label="Voice coming soon"
                className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-500"
              >
                <Mic className="h-5 w-5" />
              </button>

              <button
                type="submit"
                disabled={!draft.trim() || isResponding}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition-all hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
