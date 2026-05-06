"use client"

import { useState, useTransition, useRef } from "react"
import { toast } from "sonner"
import { Upload, FileSpreadsheet, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { importTransactions } from "@/app/finance/actions"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColMap {
  date: number
  description: number
  amount: number
  debit: number
  credit: number
  type: number
}

interface ImportRow {
  _id: string
  date: string
  description: string
  amount: number
  type: "income" | "expense"
  category: string
}

// ─── CSV parser (handles quoted fields, CRLF, escaped quotes) ─────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  for (const line of lines) {
    if (!line.trim()) continue
    const row: string[] = []
    let field = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { field += '"'; i++ }
          else inQuotes = false
        } else {
          field += ch
        }
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { row.push(field); field = "" }
        else field += ch
      }
    }
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ─── Column detection from header names ───────────────────────────────────────

function detectColumns(headers: string[]): ColMap {
  const h = headers.map((s) => s.trim().toLowerCase())
  const find = (...patterns: RegExp[]) => {
    for (const p of patterns) {
      const i = h.findIndex((col) => p.test(col))
      if (i !== -1) return i
    }
    return -1
  }
  return {
    date: find(/^transaction\s*date$/, /^trans\.?\s*date$/, /^date$/, /date/),
    description: find(
      /^description$/, /^desc$/, /^memo$/, /^payee$/, /^merchant$/, /^narrative$/,
      /description|memo|payee|merchant|narrative/,
    ),
    amount: find(/^amount$/, /^amt$/, /amount|amt/),
    debit: find(/^debit(\s*amount)?$/),
    credit: find(/^credit(\s*amount)?$/),
    type: find(/^type$/),
  }
}

// ─── Data-pattern column detection (for headerless CSVs like Wells Fargo) ─────

function detectColumnsFromData(rows: string[][]): ColMap {
  const sample = rows.slice(0, Math.min(5, rows.length))
  const numCols = Math.max(...sample.map((r) => r.length))
  let dateCol = -1, descCol = -1, amountCol = -1

  for (let col = 0; col < numCols; col++) {
    const vals = sample.map((r) => r[col]?.trim() ?? "")
    const dateHits = vals.filter((v) =>
      /^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v),
    ).length
    const amtHits = vals.filter((v) =>
      /^-?\$?[\d,]+\.\d{2}$/.test(v.trim()),
    ).length
    if (dateHits >= sample.length * 0.6 && dateCol === -1) dateCol = col
    else if (amtHits >= sample.length * 0.5 && amountCol === -1) amountCol = col
    else if (vals.some((v) => v.length > 5) && descCol === -1 && col !== dateCol) descCol = col
  }

  return { date: dateCol, description: descCol, amount: amountCol, debit: -1, credit: -1, type: -1 }
}

// ─── Date normalization ────────────────────────────────────────────────────────

function normalizeDate(raw: string): string {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const mdy4 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy4) return `${mdy4[3]}-${mdy4[1].padStart(2, "0")}-${mdy4[2].padStart(2, "0")}`
  const mdy2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (mdy2) {
    const yr = +mdy2[3] < 50 ? `20${mdy2[3]}` : `19${mdy2[3]}`
    return `${yr}-${mdy2[1].padStart(2, "0")}-${mdy2[2].padStart(2, "0")}`
  }
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) return `${dash[3]}-${dash[1].padStart(2, "0")}-${dash[2].padStart(2, "0")}`
  return s
}

// ─── Amount parsing ────────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  const s = raw.trim()
  const negative = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"))
  const cleaned = s.replace(/[$€£,\s()\-]/g, "")
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : Math.abs(n) * (negative ? -1 : 1)
}

// ─── Auto-categorize by description keywords ──────────────────────────────────

const ALL_CATEGORIES = [
  "Food", "Transport", "Shopping", "Car", "Subscriptions",
  "Travel", "Health", "Fitness", "Bills", "Insurance",
  "Housing", "Cash", "Transfer", "Income", "Other",
]

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/uber|lyft|taxi|transit|subway|metro|bart|mta\b|bus\b/i, "Transport"],
  [/netflix|spotify|hulu|hbo|disney|apple\.com\/bill|amazon prime|prime video|paramount|peacock|sling|youtube premium|audible/i, "Subscriptions"],
  [/walmart|target|costco|kroger|trader joe|whole foods|home depot|lowe'?s|best buy|ebay|amazon(?!.*prime)/i, "Shopping"],
  [/shell|exxon|mobil|chevron|\bbp\b|sunoco|citgo|marathon|speedway|wawa|gas station|\bfuel\b|arco\b|love'?s travel/i, "Car"],
  [/restaurant|mcdonald|burger king|taco bell|chipotle|wendy'?s|pizza|starbucks|dunkin|doordash|grubhub|uber.?eats|chick.fil|panera|domino|denny'?s|ihop|dairy queen|\bkfc\b|popeyes|waffle house/i, "Food"],
  [/delta\b|united airlines|american air|southwest air|jetblue|spirit air|frontier air|\bhotel\b|airbnb|marriott|hilton|expedia|booking\.com|hyatt|holiday inn|priceline/i, "Travel"],
  [/cvs|walgreens|rite aid|hospital|doctor|dental|medical|pharmacy|urgent care|optum|cigna|aetna|blue cross/i, "Health"],
  [/gym|planet fitness|24 hour fitness|equinox|crossfit|anytime fitness|la fitness/i, "Fitness"],
  [/\batm\b|cash withdrawal/i, "Cash"],
  [/insurance|geico|progressive|allstate|state farm|liberty mutual|nationwide/i, "Insurance"],
  [/electric|water bill|gas bill|utility|at&t|verizon|comcast|xfinity|t-mobile|sprint|spectrum|\bcox\b/i, "Bills"],
  [/zelle|venmo|paypal|cash.?app|wire transfer/i, "Transfer"],
  [/salary|payroll|direct dep|adp\b|gusto|paychex/i, "Income"],
  [/\brent\b|mortgage|\bhoa\b/i, "Housing"],
]

function detectCategory(desc: string): string {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(desc)) return cat
  return "Other"
}

// ─── Build ImportRow[] from raw parsed CSV ────────────────────────────────────

function buildRows(rawRows: string[][], colMap: ColMap, hasHeader: boolean): ImportRow[] {
  const dataRows = hasHeader ? rawRows.slice(1) : rawRows
  return dataRows
    .filter((row) => row.length > 1 && row.some((c) => c.trim()))
    .map((row, i) => {
      const cell = (col: number) => (col >= 0 && col < row.length ? row[col] : "")

      const date = normalizeDate(cell(colMap.date))
      const description = cell(colMap.description).trim() || `Row ${i + 2}`

      let amount: number
      let type: "income" | "expense"

      if (colMap.debit >= 0 || colMap.credit >= 0) {
        // Capital One / two-column style
        const debit = parseAmount(cell(colMap.debit))
        const credit = parseAmount(cell(colMap.credit))
        if (credit > 0) { amount = credit; type = "income" }
        else { amount = Math.abs(debit); type = "expense" }
      } else {
        const raw = parseAmount(cell(colMap.amount))
        amount = Math.abs(raw)
        // Negative = expense (Chase), positive = income
        type = raw < 0 ? "expense" : "income"
        // Override with type column if present
        if (colMap.type >= 0) {
          const tv = cell(colMap.type).toLowerCase()
          if (/credit|income|deposit/i.test(tv)) type = "income"
          else if (/debit|sale|purchase|expense/i.test(tv)) type = "expense"
        }
      }

      return {
        _id: `row-${i}`,
        date,
        description,
        amount,
        type,
        category: detectCategory(description),
      }
    })
    .filter((r) => r.amount > 0)
}

// ─── CsvImporter component ────────────────────────────────────────────────────

type Step = "upload" | "preview"

export function CsvImporter() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("upload")
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState("")
  const [headers, setHeaders] = useState<string[]>([])
  const [colMap, setColMap] = useState<ColMap>({
    date: -1, description: -1, amount: -1, debit: -1, credit: -1, type: -1,
  })
  const [hasHeader, setHasHeader] = useState(true)
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [rows, setRows] = useState<ImportRow[]>([])
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep("upload")
    setFileName("")
    setHeaders([])
    setRows([])
    setRawRows([])
    setColMap({ date: -1, description: -1, amount: -1, debit: -1, credit: -1, type: -1 })
    setHasHeader(true)
  }

  function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a .csv file")
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.length < 1) { toast.error("CSV appears to be empty"); return }

      // Detect whether first row is headers or data
      const firstCell = parsed[0][0]?.trim() ?? ""
      const firstRowIsData =
        /^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/.test(firstCell) ||
        /^\d{4}-\d{2}-\d{2}$/.test(firstCell)

      let hdrs: string[]
      let hdr: boolean
      let detected: ColMap

      if (firstRowIsData) {
        // Wells Fargo-style: no headers
        hdr = false
        hdrs = parsed[0].map((_, i) => `Column ${i + 1}`)
        detected = detectColumnsFromData(parsed)
      } else {
        hdr = true
        hdrs = parsed[0]
        detected = detectColumns(hdrs)
      }

      setHeaders(hdrs)
      setHasHeader(hdr)
      setColMap(detected)
      setRawRows(parsed)
      setRows(buildRows(parsed, detected, hdr))
      setStep("preview")
    }
    reader.readAsText(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ""
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function setCol(key: keyof ColMap, value: number) {
    const updated = { ...colMap, [key]: value }
    setColMap(updated)
    setRows(buildRows(rawRows, updated, hasHeader))
  }

  function toggleHeader(checked: boolean) {
    setHasHeader(checked)
    setRows(buildRows(rawRows, colMap, checked))
  }

  function setRowCategory(id: string, category: string) {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, category } : r)))
  }

  function handleImport() {
    startTransition(async () => {
      const result = await importTransactions(
        rows.map(({ date, description, amount, type, category }) => ({
          date,
          title: description,
          amount,
          type,
          category,
        })),
      )
      if (result.error) { toast.error(result.error); return }
      toast.success(`${result.count} transaction${result.count !== 1 ? "s" : ""} imported`)
      setOpen(false)
      reset()
    })
  }

  const incomeCount = rows.filter((r) => r.type === "income").length
  const expenseCount = rows.filter((r) => r.type === "expense").length
  const colOptions = headers.map((h, i) => ({ label: h || `Column ${i + 1}`, value: String(i) }))

  const ColSelect = ({
    label, field,
  }: {
    label: string
    field: keyof ColMap
  }) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={colMap[field] >= 0 ? String(colMap[field]) : "__none"}
        onValueChange={(v) => setCol(field, v === "__none" ? -1 : +v)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="— skip —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">— skip —</SelectItem>
          {colOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent">
          <Upload className="w-4 h-4" />
          Import CSV
        </Button>
      </DialogTrigger>

      <DialogContent
        className={
          step === "preview"
            ? "sm:max-w-4xl flex flex-col max-h-[92vh]"
            : "sm:max-w-md"
        }
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {step === "preview" && (
              <button
                onClick={() => setStep("upload")}
                className="rounded-md p-1 hover:bg-muted transition-colors"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {step === "upload"
              ? "Import Bank Statement CSV"
              : `Preview — ${rows.length} transactions detected`}
          </DialogTitle>
        </DialogHeader>

        {/* ── Upload step ──────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4 mt-1">
            <p className="text-sm text-muted-foreground">
              Supports Chase, Bank of America, Wells Fargo, Capital One, and most standard bank CSV exports.
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/30"
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <FileSpreadsheet className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm text-foreground">
                  Drop your CSV here
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  or{" "}
                  <span className="text-primary underline underline-offset-2">
                    click to browse
                  </span>
                </p>
              </div>
              <Badge variant="outline" className="text-xs">.csv files only</Badge>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
              <p className="font-medium text-foreground">Supported formats:</p>
              <p>• <span className="font-medium">Chase</span> — Transaction Date, Description, Amount</p>
              <p>• <span className="font-medium">Bank of America</span> — Date, Description, Amount</p>
              <p>• <span className="font-medium">Wells Fargo</span> — no header row, 5-column format</p>
              <p>• <span className="font-medium">Capital One</span> — separate Debit / Credit columns</p>
            </div>
          </div>
        )}

        {/* ── Preview step ─────────────────────────────────────────── */}
        {step === "preview" && (
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
            {/* Column mapping */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <ColSelect label="Date column" field="date" />
              <ColSelect label="Description column" field="description" />
              <ColSelect label="Amount column" field="amount" />
              <ColSelect label="Type column" field="type" />
            </div>

            {/* Stats + header toggle */}
            <div className="flex items-center justify-between gap-3 shrink-0">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => toggleHeader(e.target.checked)}
                  className="rounded border-border accent-primary"
                />
                <span className="text-xs text-muted-foreground">First row is a header</span>
              </label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  {incomeCount} income
                </Badge>
                <Badge variant="outline" className="gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                  {expenseCount} expense
                </Badge>
                {fileName && (
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={fileName}>
                    {fileName}
                  </span>
                )}
              </div>
            </div>

            {/* Preview table */}
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2 border rounded-lg flex-1">
                <FileSpreadsheet className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  No valid rows detected. Try adjusting the column mapping above.
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden flex-1 min-h-0">
                <div className="overflow-y-auto h-full">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                      <TableRow>
                        <TableHead className="w-24">Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-28 text-right">Amount</TableHead>
                        <TableHead className="w-20">Type</TableHead>
                        <TableHead className="w-36">Category</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row._id}>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {row.date}
                          </TableCell>
                          <TableCell className="text-xs max-w-[220px]">
                            <span className="truncate block" title={row.description}>
                              {row.description}
                            </span>
                          </TableCell>
                          <TableCell
                            className={`text-xs text-right font-semibold tabular-nums ${
                              row.type === "income"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {row.type === "income" ? "+" : "−"}$
                            {row.amount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] h-5 px-1.5 ${
                                row.type === "income"
                                  ? "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
                                  : "border-rose-200 text-rose-700 dark:border-rose-800 dark:text-rose-400"
                              }`}
                            >
                              {row.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1">
                            <Select
                              value={row.category}
                              onValueChange={(v) => setRowCategory(row._id, v)}
                            >
                              <SelectTrigger className="h-6 text-[11px] px-2 w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALL_CATEGORIES.map((c) => (
                                  <SelectItem key={c} value={c} className="text-xs">
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between shrink-0 pt-1 border-t">
              <p className="text-xs text-muted-foreground">
                {rows.length} transaction{rows.length !== 1 ? "s" : ""} ready to import
              </p>
              <Button
                onClick={handleImport}
                disabled={isPending || rows.length === 0}
                className="gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Import {rows.length} transaction{rows.length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
