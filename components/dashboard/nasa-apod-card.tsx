"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { ExternalLink, ChevronDown, ChevronUp, X } from "lucide-react"

interface ApodData {
  title: string
  date: string
  explanation: string
  url: string
  hdurl?: string
  media_type: "image" | "video"
  copyright?: string
}

export function NasaApodCard({ apod }: { apod: ApodData | null }) {
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (!apod || dismissed) return null

  const shortExplanation = apod.explanation.slice(0, 300)
  const isLong = apod.explanation.length > 300

  return (
    <Card className="overflow-hidden">
      {apod.media_type === "image" ? (
        <a href={apod.hdurl ?? apod.url} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={apod.url}
            alt={apod.title}
            className="w-full max-h-[480px] object-cover object-center"
          />
        </a>
      ) : (
        <div className="aspect-video w-full">
          <iframe src={apod.url} className="w-full h-full" allowFullScreen title={apod.title} />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">NASA · Image of the Day</p>
            <h3 className="font-semibold text-base leading-snug">{apod.title}</h3>
            {apod.copyright && (
              <p className="text-xs text-muted-foreground mt-0.5">© {apod.copyright.trim()}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1">
            {apod.media_type === "image" && (
              <a
                href={apod.hdurl ?? apod.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="View full resolution"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {expanded ? apod.explanation : shortExplanation}
          {isLong && !expanded && "…"}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Read more</>}
          </button>
        )}
      </div>
    </Card>
  )
}
