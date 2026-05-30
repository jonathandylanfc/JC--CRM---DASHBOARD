"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, RefreshCw, AlertCircle, Send, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Insight {
  icon: string
  text: string
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const SUGGESTED_QUESTIONS = [
  "Should I take profits?",
  "What are the risks?",
  "Is now a good time to buy more?",
  "How diversified am I?",
]

export function AiMarketInsights() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [insightsError, setInsightsError] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [showInsights, setShowInsights] = useState(true)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function loadInsights() {
    setInsightsLoading(true)
    setInsightsError(false)
    fetch("/api/investments/ai-insights")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setInsightsError(true); return }
        setInsights(d.insights ?? [])
        setGeneratedAt(d.generatedAt ?? null)
      })
      .catch(() => setInsightsError(true))
      .finally(() => setInsightsLoading(false))
  }

  useEffect(() => { loadInsights() }, [])

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, chatLoading])

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || chatLoading) return

    const userMsg: ChatMessage = { role: "user", content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setChatLoading(true)

    try {
      const res = await fetch("/api/investments/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: newMessages.slice(0, -1), // exclude the message we just added
        }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }])
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Try again." }])
    } finally {
      setChatLoading(false)
      inputRef.current?.focus()
    }
  }

  const timeLabel = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          <h2 className="text-sm font-semibold text-foreground">AI Market Insights</h2>
          {timeLabel && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">· as of {timeLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-muted-foreground hover:text-foreground"
            onClick={loadInsights}
            disabled={insightsLoading}
            title="Refresh insights"
          >
            <RefreshCw className={`w-3 h-3 ${insightsLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-muted-foreground hover:text-foreground"
            onClick={() => setShowInsights((v) => !v)}
            title={showInsights ? "Hide insights" : "Show insights"}
          >
            {showInsights ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Insights bullets */}
      {showInsights && (
        <div className="px-4 py-3 border-b border-border space-y-1.5">
          {insightsLoading ? (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
              ))}
              <p className="text-[10px] text-muted-foreground text-center pt-1">Analyzing your portfolio…</p>
            </>
          ) : insightsError ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              <p className="text-xs text-muted-foreground">Couldn't load insights. Check your Anthropic API key in Railway.</p>
            </div>
          ) : insights.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">Add holdings to get AI insights.</p>
          ) : (
            <>
              {insights.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-sm leading-none mt-0.5 shrink-0">{item.icon}</span>
                  <p className="text-xs text-foreground leading-snug">{item.text}</p>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground text-center pt-0.5">AI-generated · not financial advice</p>
            </>
          )}
        </div>
      )}

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-72 min-h-[60px]">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            Ask me anything about your portfolio
          </p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}
              >
                {msg.role === "assistant" && (
                  <span className="text-[10px] font-medium text-violet-500 block mb-0.5">✦ AI</span>
                )}
                {msg.content}
              </div>
            </div>
          ))
        )}
        {chatLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
              <span className="text-[10px] font-medium text-violet-500 block mb-1">✦ AI</span>
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions — only shown when chat is empty */}
      {messages.length === 0 && !chatLoading && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-1">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage() }}
          className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/50 transition-colors"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your portfolio…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            disabled={chatLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || chatLoading}
            className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
          >
            <Send className="w-3 h-3" />
          </button>
        </form>
      </div>
    </div>
  )
}
