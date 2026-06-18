"use client"

import { useTransition, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogOut, Camera, Check } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { signOut } from "@/app/login/actions"
import { updateProfile } from "@/app/settings/actions"
import { toast } from "sonner"

interface SettingsContentProps {
  initialName: string
  initialEmail: string
  initialAvatarUrl: string | null
  initialShowInvestments?: boolean
  initialShowNasaApod?: boolean
}

export function SettingsContent({ initialName, initialEmail, initialAvatarUrl, initialShowInvestments = true, initialShowNasaApod = true }: SettingsContentProps) {
  const { theme, setTheme } = useTheme()
  const [isLoggingOut, startLogout] = useTransition()
  const [isSaving, startSaving] = useTransition()
  const [name, setName] = useState(initialName)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialAvatarUrl)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [showInvestments, setShowInvestments] = useState(initialShowInvestments)
  const [showNasaApod, setShowNasaApod] = useState(initialShowNasaApod)
  const [isSavingNav, startSavingNav] = useTransition()
  const [isSavingApod, startSavingApod] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleShowNasaApodToggle(checked: boolean) {
    setShowNasaApod(checked)
    startSavingApod(async () => {
      const { updateShowNasaApod } = await import("@/app/settings/actions")
      const result = await updateShowNasaApod(checked)
      if (result?.error) toast.error(result.error)
    })
  }

  function handleShowInvestmentsToggle(checked: boolean) {
    setShowInvestments(checked)
    startSavingNav(async () => {
      const { updateShowInvestments } = await import("@/app/settings/actions")
      const result = await updateShowInvestments(checked)
      if (result?.error) {
        toast.error(result.error)
        setShowInvestments(!checked) // revert
      } else {
        toast.success(checked ? "Investments tab enabled" : "Investments tab hidden")
      }
    })
  }

  function handleLogout() {
    startLogout(async () => {
      await signOut()
    })
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB")
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function handleSaveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData()
    fd.set("full_name", name)
    if (avatarFile) fd.set("avatar", avatarFile)

    startSaving(async () => {
      const result = await updateProfile(fd)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Profile saved!")
        setAvatarFile(null)
      }
    })
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?"

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Profile */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-6">Profile Information</h3>
        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <Avatar className="w-20 h-20">
                <AvatarImage src={avatarPreview ?? undefined} alt={name} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                Change Photo
              </Button>
              <p className="text-xs text-muted-foreground mt-2">JPG, PNG or GIF. Max size 2MB</p>
              {avatarFile && (
                <p className="text-xs text-primary mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> {avatarFile.name} selected
                </p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Name + Email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={initialEmail}
                disabled
                className="opacity-60 cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
            </div>
          </div>

          <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      </Card>

      {/* Notifications */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-6">Notifications</h3>
        <div className="space-y-4">
          {[
            { label: "Email notifications", description: "Receive email about your account activity" },
            { label: "Push notifications", description: "Receive push notifications in your browser" },
            { label: "Task reminders", description: "Get reminded about upcoming task deadlines" },
            { label: "Team updates", description: "Notifications about team member activities" },
          ].map((item, index) => (
            <div
              key={item.label}
              className="flex items-center justify-between py-3 border-b border-border last:border-0"
            >
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Switch defaultChecked={index < 2} />
            </div>
          ))}
        </div>
      </Card>

      {/* Appearance */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-6">Appearance</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Dark Mode</p>
              <p className="text-sm text-muted-foreground">Enable dark mode theme</p>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Show Investments Tab</p>
              <p className="text-sm text-muted-foreground">Display Investments in the sidebar and bottom navigation</p>
            </div>
            <Switch
              checked={showInvestments}
              onCheckedChange={handleShowInvestmentsToggle}
              disabled={isSavingNav}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">NASA Image of the Day</p>
              <p className="text-sm text-muted-foreground">Show today&apos;s NASA astronomy photo on the dashboard</p>
            </div>
            <Switch
              checked={showNasaApod}
              onCheckedChange={handleShowNasaApodToggle}
              disabled={isSavingApod}
            />
          </div>
        </div>
      </Card>

      {/* Account */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">Account</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Sign out</p>
            <p className="text-sm text-muted-foreground">Sign out of your account on this device</p>
          </div>
          <Button
            variant="outline"
            className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive bg-transparent"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <LogOut className="w-4 h-4" />
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
