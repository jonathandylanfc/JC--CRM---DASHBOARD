import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { ProjectAnalytics } from "@/components/dashboard/project-analytics"
import { Reminders } from "@/components/dashboard/reminders"
import { ProjectList } from "@/components/dashboard/project-list"
import { TeamCollaboration } from "@/components/dashboard/team-collaboration"
import { ProjectProgress } from "@/components/dashboard/project-progress"
import { MobileAppCard } from "@/components/dashboard/mobile-app-card"
import { TimeTracker } from "@/components/dashboard/time-tracker"
import { Button } from "@/components/ui/button"
import {
  getTaskStats,
  getWeeklyFocusActivity,
  getUpcomingAssignments,
  getRecentTasks,
  getGoalStats,
  getTodayFocusMinutes,
  getUserProfile,
  getAssignmentCount,
  getMonthlyFinanceSummary,
} from "@/lib/data"

export default async function DashboardPage() {
  const [
    taskStats,
    weeklyActivity,
    upcomingAssignments,
    recentTasks,
    goalStats,
    todayMinutes,
    user,
    assignmentsDue,
    financeSummary,
  ] = await Promise.all([
    getTaskStats(),
    getWeeklyFocusActivity(),
    getUpcomingAssignments(),
    getRecentTasks(),
    getGoalStats(),
    getTodayFocusMinutes(),
    getUserProfile(),
    getAssignmentCount(),
    getMonthlyFinanceSummary(),
  ])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64">
        <Header
          title="Dashboard"
          description="Plan, prioritize, and accomplish your tasks with ease."
          user={user ?? undefined}
          actions={
            <>
              <Button className="w-full sm:w-auto h-9 text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 hover:shadow-lg hover:shadow-primary/30 hover:scale-105">
                + Add Task
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto h-9 text-sm transition-all duration-300 hover:shadow-md hover:scale-105 bg-transparent"
              >
                Import Data
              </Button>
            </>
          }
        />

        <div className="mt-4 md:mt-5 space-y-3 md:space-y-4">
          <StatsCards
            totalTasks={taskStats.total}
            tasksDone={taskStats.done}
            assignmentsDue={assignmentsDue}
            monthlyIncome={financeSummary.income}
            monthlyExpenses={financeSummary.expenses}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <div className="lg:col-span-2 space-y-3 md:space-y-4">
              <ProjectAnalytics weeklyData={weeklyActivity} />
              <TeamCollaboration tasks={recentTasks} />
            </div>

            <div className="space-y-3 md:space-y-4">
              <Reminders tasks={upcomingAssignments} />
              <ProjectProgress {...goalStats} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <ProjectList tasks={recentTasks} />
            <MobileAppCard />
            <TimeTracker initialMinutes={todayMinutes} />
          </div>
        </div>
      </main>
    </div>
  )
}
