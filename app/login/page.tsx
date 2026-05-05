"use client"

import { useState, useTransition } from "react"
import { signIn, signUp, signInWithMagicLink } from "./actions"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckSquare, Mail, Lock, User, Sparkles, AlertCircle, CheckCircle } from "lucide-react"

export default function LoginPage() {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await signIn(fd)
      if (result?.error) setMessage({ type: "error", text: result.error })
    })
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await signUp(fd)
      if (result?.error) setMessage({ type: "error", text: result.error })
      if (result?.success) setMessage({ type: "success", text: result.success })
    })
  }

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await signInWithMagicLink(fd)
      if (result?.error) setMessage({ type: "error", text: result.error })
      if (result?.success) setMessage({ type: "success", text: result.success })
    })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-slide-in-up">

        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center relative">
              <div className="w-2 h-2 rounded-full bg-primary-foreground absolute" style={{ top: "28%", left: "28%" }} />
              <div className="w-2 h-2 rounded-full bg-primary-foreground absolute" style={{ top: "28%", right: "28%" }} />
              <div className="w-4 h-2 border-b-2 border-primary-foreground rounded-full absolute bottom-3" />
            </div>
            <span className="text-2xl font-bold text-foreground">Dylan Pro</span>
          </div>
          <p className="text-sm text-muted-foreground">Plan, prioritize, and accomplish your tasks with ease</p>
        </div>

        <Card className="p-6">
          <Tabs defaultValue="signin" onValueChange={() => setMessage(null)}>
            <TabsList className="grid grid-cols-3 w-full mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
              <TabsTrigger value="magic">Magic Link</TabsTrigger>
            </TabsList>

            {/* Sign In */}
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signin-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="signin-email" name="email" type="email" placeholder="you@example.com" className="pl-9" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signin-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="signin-password" name="password" type="password" placeholder="••••••••" className="pl-9" required />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? "Signing in…" : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            {/* Sign Up */}
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="signup-name" name="full_name" type="text" placeholder="Jonathan Dylan" className="pl-9" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="signup-email" name="email" type="email" placeholder="you@example.com" className="pl-9" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="signup-password" name="password" type="password" placeholder="Min. 6 characters" className="pl-9" required minLength={6} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? "Creating account…" : "Create Account"}
                </Button>
              </form>
            </TabsContent>

            {/* Magic Link */}
            <TabsContent value="magic">
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="text-center space-y-1 mb-2">
                  <Sparkles className="w-8 h-8 text-primary mx-auto" />
                  <p className="text-sm text-muted-foreground">We'll email you a link — no password needed.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="magic-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="magic-email" name="email" type="email" placeholder="you@example.com" className="pl-9" required />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? "Sending…" : "Send Magic Link"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Feedback */}
          {message && (
            <div className={`mt-4 flex items-start gap-2 text-sm rounded-lg p-3 ${
              message.type === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            }`}>
              {message.type === "error"
                ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                : <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              }
              {message.text}
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Your data is private and protected with row-level security.
        </p>
      </div>
    </div>
  )
}
