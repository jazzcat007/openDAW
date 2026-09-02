import {Nullable} from "@opendaw/lib-std"

export type DailySeries = ReadonlyArray<readonly [date: string, value: number]>

export type RoomStats = {
    count: DailySeries
    duration: DailySeries
}

export type GitHubStats = {
    stars: number
    forks: number
    watchers: number
    openIssues: number
    lastCommit: number
}

export type DiscordStats = {
    name: string
    total: number
    online: number
}

export type ErrorStats = {
    total: number
    fixed: number
    unfixed: number
    ratio: string
}

export type BuildInfo = {
    date: number
    uuid: string
    env: string
}

export type Sponsor = {
    type: "User" | "Organization"
    login: string
    name: Nullable<string>
    avatarUrl: string
    url: string
}

export type Contributor = {
    login: string
    avatarUrl: string
    url: string
    contributions: number
}

export type SponsorStats = {
    fetchedAt: Nullable<string>
    totalCount: number
    sponsors: ReadonlyArray<Sponsor>
}

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, init)
    if (!response.ok) {throw new Error(`${response.status} ${response.statusText}`)}
    return await response.json() as T
}

const emptyDailySeries = (): DailySeries => []

export const fetchRoomStats = async (): Promise<RoomStats> => {
    return {count: emptyDailySeries(), duration: emptyDailySeries()}
}

export const fetchUserStats = async (): Promise<DailySeries> => {
    return emptyDailySeries()
}

export const fetchGitHubStats = async (): Promise<GitHubStats> => {
    return {stars: 0, forks: 0, watchers: 0, openIssues: 0, lastCommit: 0}
}

export const fetchContributors = async (): Promise<ReadonlyArray<Contributor>> => {
    return []
}

export const fetchDiscordStats = async (): Promise<DiscordStats> => {
    return {name: "local", total: 0, online: 0}
}

export const fetchSponsorStats = async (): Promise<SponsorStats> =>
    fetchJson<SponsorStats>(`/sponsors.json?t=${Date.now()}`)

export const fetchBuildInfo = async (): Promise<BuildInfo> =>
    fetchJson<BuildInfo>(`/build-info.json?t=${Date.now()}`)

export const formatRelativeDate = (timestamp: number): string => {
    const diff = Date.now() - timestamp
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    if (days === 0) return "today"
    if (days === 1) return "1 day ago"
    if (days < 30) return `${days} days ago`
    const months = Math.floor(days / 30)
    if (months === 1) return "1 month ago"
    return `${months} months ago`
}

export const fetchNpmWeeklyDownloads = async (packageName: string): Promise<number> => {
    void packageName
    return 0
}

export const bestColumnCount = (totalCells: number): number => {
    if (totalCells <= 1) return 1
    let bestCols = totalCells
    for (let rows = 1; rows * rows <= totalCells; rows++) {
        if (totalCells % rows === 0) bestCols = totalCells / rows
    }
    return bestCols
}

export const fetchErrorStats = async (): Promise<ErrorStats> => {
    return {total: 0, fixed: 0, unfixed: 0, ratio: "0%"}
}

export type LatencyStats = { distribution: DailySeries, unsupported: number, total: number }

export const fetchLatencyStats = async (): Promise<LatencyStats> => {
    return {distribution: [], unsupported: 0, total: 0}
}

export const fetchVisitorStats = async (): Promise<DailySeries> => {
    return emptyDailySeries()
}

export const fetchVisitStats = async (): Promise<DailySeries> => {
    return emptyDailySeries()
}

export const sumValues = (series: DailySeries): number =>
    series.reduce((acc, [, value]) => acc + value, 0)

export const lastValue = (series: DailySeries): number =>
    series.length === 0 ? 0 : series[series.length - 1][1]

// The most recent day in any DailySeries is still being written to, so its
// value is always partial. Drop it before charting/trending — otherwise the
// last point sits below the trend and skews any visual reading.
export const dropPartialDay = (series: DailySeries): DailySeries =>
    series.length > 0 ? series.slice(0, -1) : series

export const minutesToHours = (series: DailySeries): DailySeries =>
    series.map(([date, minutes]) => [date, minutes / 60] as const)

export const formatHours = (hours: number): string => {
    if (hours < 1) return `${Math.round(hours * 60)} min`
    if (hours < 100) return `${hours.toFixed(1)} h`
    return `${Math.round(hours)} h`
}

export const formatNumber = (value: number): string => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return value.toString()
}
