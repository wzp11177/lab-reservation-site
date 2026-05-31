import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addDays,
  addWeeks,
  format,
  isSameDay,
  startOfWeek,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  CalendarDays,
  Check,
  Cloud,
  RefreshCw,
  Trash2,
  UserRound,
  WifiOff,
} from 'lucide-react'
import './App.css'

const USERS = ['王志鹏', '周子茹', '张正梁'] as const
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const STORAGE_KEY = 'lab-reservations'
const SELECTED_USER_KEY = 'lab-selected-user'
const CLEANUP_WEEK_KEY = 'lab-cleanup-week-start'
const APP_META_CLEANUP_KEY = 'cleanup_week_start'

type UserName = (typeof USERS)[number]

type Reservation = {
  id: string
  slot_start: string
  user_name: UserName
  created_at: string
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const hasCloudConfig = Boolean(supabaseUrl?.trim() && supabaseAnonKey?.trim())
const supabase: SupabaseClient | null = hasCloudConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null

function isKnownUser(value: string | null): value is UserName {
  return USERS.includes(value as UserName)
}

function getSavedUser(): UserName {
  const saved = window.localStorage.getItem(SELECTED_USER_KEY)
  return isKnownUser(saved) ? saved : USERS[0]
}

function slotKey(slot: Date | string): string {
  return new Date(slot).toISOString()
}

function weekKey(weekStart: Date): string {
  return format(weekStart, 'yyyy-MM-dd')
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

function makeSlot(day: Date, hour: number): Date {
  const slot = new Date(day)
  slot.setHours(hour, 0, 0, 0)
  return slot
}

function getLocalReservations(): Reservation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Reservation[]) : []
  } catch {
    return []
  }
}

function saveLocalReservations(reservations: Reservation[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations))
}

function toReservationMap(reservations: Reservation[]) {
  return reservations.reduce<Record<string, Reservation>>((acc, reservation) => {
    acc[slotKey(reservation.slot_start)] = reservation
    return acc
  }, {})
}

function App() {
  const [selectedUser, setSelectedUser] = useState<UserName>(getSavedUser)
  const [activeWeekOffset, setActiveWeekOffset] = useState(0)
  const [selectedMobileDay, setSelectedMobileDay] = useState(0)
  const [reservations, setReservations] = useState<Record<string, Reservation>>(
    {},
  )
  const [isLoading, setIsLoading] = useState(true)
  const [statusText, setStatusText] = useState('正在准备预约表')
  const [errorText, setErrorText] = useState('')
  const [pendingSlot, setPendingSlot] = useState<string | null>(null)

  const currentWeekStart = useMemo(
    () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    [],
  )
  const visibleWeekStart = useMemo(
    () => addWeeks(currentWeekStart, activeWeekOffset),
    [activeWeekOffset, currentWeekStart],
  )
  const visibleDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(visibleWeekStart, index)),
    [visibleWeekStart],
  )
  const visibleRangeLabel = `${format(visibleDays[0], 'M月d日', {
    locale: zhCN,
  })} - ${format(visibleDays[6], 'M月d日', { locale: zhCN })}`

  const loadReservations = useCallback(async () => {
    setErrorText('')
    const rangeStart = currentWeekStart
    const rangeEnd = addWeeks(currentWeekStart, 2)

    if (!supabase) {
      const localReservations = getLocalReservations().filter((reservation) => {
        const slot = new Date(reservation.slot_start)
        return slot >= rangeStart && slot < rangeEnd
      })
      setReservations(toReservationMap(localReservations))
      setStatusText('本地演示模式，配置 Supabase 后即可在线同步')
      setIsLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('reservations')
      .select('id, slot_start, user_name, created_at')
      .gte('slot_start', rangeStart.toISOString())
      .lt('slot_start', rangeEnd.toISOString())
      .order('slot_start', { ascending: true })

    if (error) {
      setErrorText(error.message)
      setStatusText('云端同步失败，请检查 Supabase 配置')
      setIsLoading(false)
      return
    }

    setReservations(toReservationMap((data ?? []) as Reservation[]))
    setStatusText(`已同步 ${format(new Date(), 'HH:mm:ss')}`)
    setIsLoading(false)
  }, [currentWeekStart])

  const runWeeklyCleanup = useCallback(async () => {
    const currentKey = weekKey(currentWeekStart)

    if (!supabase) {
      if (window.localStorage.getItem(CLEANUP_WEEK_KEY) === currentKey) {
        return
      }

      const cleaned = getLocalReservations().filter(
        (reservation) => new Date(reservation.slot_start) >= currentWeekStart,
      )
      saveLocalReservations(cleaned)
      window.localStorage.setItem(CLEANUP_WEEK_KEY, currentKey)
      return
    }

    const { data } = await supabase
      .from('app_meta')
      .select('value')
      .eq('key', APP_META_CLEANUP_KEY)
      .maybeSingle()

    if (data?.value === currentKey) {
      return
    }

    const { error: cleanupError } = await supabase
      .from('reservations')
      .delete()
      .lt('slot_start', currentWeekStart.toISOString())

    if (cleanupError) {
      setErrorText(cleanupError.message)
      return
    }

    const { error: metaError } = await supabase.from('app_meta').upsert({
      key: APP_META_CLEANUP_KEY,
      value: currentKey,
      updated_at: new Date().toISOString(),
    })

    if (metaError) {
      setErrorText(metaError.message)
    }
  }, [currentWeekStart])

  useEffect(() => {
    window.localStorage.setItem(SELECTED_USER_KEY, selectedUser)
  }, [selectedUser])

  useEffect(() => {
    let isCurrent = true

    async function bootstrap() {
      setIsLoading(true)
      await runWeeklyCleanup()
      if (isCurrent) {
        await loadReservations()
      }
    }

    bootstrap()

    if (!supabase) {
      return () => {
        isCurrent = false
      }
    }

    const channel = supabase
      .channel('lab-reservation-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        () => {
          loadReservations()
        },
      )
      .subscribe()

    return () => {
      isCurrent = false
      supabase.removeChannel(channel)
    }
  }, [loadReservations, runWeeklyCleanup])

  async function handleSlotClick(slot: Date) {
    const key = slotKey(slot)
    const existing = reservations[key]
    setPendingSlot(key)
    setErrorText('')

    try {
      if (existing) {
        const confirmed = window.confirm(
          `确定取消 ${existing.user_name} 在 ${format(slot, 'M月d日 HH:mm')} 的预约吗？`,
        )

        if (!confirmed) {
          return
        }

        if (!supabase) {
          const next = getLocalReservations().filter(
            (reservation) => reservation.id !== existing.id,
          )
          saveLocalReservations(next)
          setReservations(toReservationMap(next))
          setStatusText('已取消本地演示预约')
          return
        }

        const { error } = await supabase
          .from('reservations')
          .delete()
          .eq('id', existing.id)

        if (error) {
          setErrorText(error.message)
          return
        }

        await loadReservations()
        return
      }

      const newReservation: Reservation = {
        id: crypto.randomUUID(),
        slot_start: key,
        user_name: selectedUser,
        created_at: new Date().toISOString(),
      }

      if (!supabase) {
        const localReservations = getLocalReservations()

        if (localReservations.some((reservation) => slotKey(reservation.slot_start) === key)) {
          setErrorText('该时段刚刚被预约，请刷新后查看。')
          return
        }

        const next = [...localReservations, newReservation]
        saveLocalReservations(next)
        setReservations(toReservationMap(next))
        setStatusText('已保存到本地演示数据')
        return
      }

      const { error } = await supabase.from('reservations').insert({
        slot_start: key,
        user_name: selectedUser,
      })

      if (error) {
        setErrorText(
          error.code === '23505'
            ? '该时段刚刚被其他人预约，请选择别的时间。'
            : error.message,
        )
        return
      }

      await loadReservations()
    } finally {
      setPendingSlot(null)
    }
  }

  function renderSlotButton(slot: Date, compact = false) {
    const key = slotKey(slot)
    const reservation = reservations[key]
    const isBooked = Boolean(reservation)
    const isPending = pendingSlot === key
    const subText = isPending ? '处理中' : isBooked ? '取消' : ''
    const className = [
      'slotButton',
      compact ? 'slotButtonCompact' : '',
      isBooked ? 'bookedSlot' : 'openSlot',
      reservation?.user_name === selectedUser ? 'ownSlot' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button
        className={className}
        type="button"
        onClick={() => handleSlotClick(slot)}
        disabled={isPending}
        title={isBooked ? '点击取消预约' : '点击预约此时段'}
      >
        <span className="slotMain">
          {isBooked ? reservation?.user_name : '预约'}
        </span>
        {subText && <span className="slotSub">{subText}</span>}
      </button>
    )
  }

  return (
    <main className="appShell">
      <section className="toolbar" aria-label="预约控制区">
        <div className="topBar">
          <div className="titleBlock">
            <h1>实验室预约</h1>
            <span className={`syncBadge ${hasCloudConfig ? 'cloudMode' : 'localMode'}`}>
              {hasCloudConfig ? <Cloud size={15} /> : <WifiOff size={15} />}
              {hasCloudConfig ? '在线' : '本地'}
            </span>
          </div>
          <div>
            <span className="statusText">{statusText}</span>
          </div>
        </div>

        <div className="controlGrid">
          <div className="controlGroup">
            <span className="controlLabel">
              <UserRound size={16} />
              使用人
            </span>
            <div className="segmentedControl" role="group" aria-label="选择使用人">
              {USERS.map((user) => (
                <button
                  key={user}
                  type="button"
                  className={selectedUser === user ? 'activeSegment' : ''}
                  onClick={() => setSelectedUser(user)}
                  aria-pressed={selectedUser === user}
                >
                  {selectedUser === user && <Check size={15} />}
                  {user}
                </button>
              ))}
            </div>
          </div>

          <div className="controlGroup weekGroup">
            <span className="controlLabel">
              <CalendarDays size={16} />
              预约范围
            </span>
            <div className="segmentedControl" role="group" aria-label="选择周次">
              <button
                type="button"
                className={activeWeekOffset === 0 ? 'activeSegment' : ''}
                onClick={() => {
                  setActiveWeekOffset(0)
                  setSelectedMobileDay(0)
                }}
                aria-pressed={activeWeekOffset === 0}
              >
                本周
              </button>
              <button
                type="button"
                className={activeWeekOffset === 1 ? 'activeSegment' : ''}
                onClick={() => {
                  setActiveWeekOffset(1)
                  setSelectedMobileDay(0)
                }}
                aria-pressed={activeWeekOffset === 1}
              >
                下周
              </button>
            </div>
          </div>

          <button
            className="refreshButton"
            type="button"
            onClick={loadReservations}
            disabled={isLoading}
          >
            <RefreshCw size={17} />
            刷新
          </button>
        </div>

        {errorText && (
          <div className="errorBanner" role="alert">
            {errorText}
          </div>
        )}
      </section>

      <section className="scheduleHeader" aria-label="当前预约周">
        <h2>{visibleRangeLabel}</h2>
      </section>

      <section className="desktopSchedule" aria-label="桌面预约表">
        <div className="scheduleTable">
          <div className="timeHeader">时间</div>
          {visibleDays.map((day) => (
            <div className="dayHeader" key={day.toISOString()}>
              <span>{format(day, 'EEEE', { locale: zhCN })}</span>
              <strong>{format(day, 'M月d日')}</strong>
              {isSameDay(day, new Date()) && <em>今天</em>}
            </div>
          ))}

          {HOURS.map((hour) => (
            <div className="timeRow" key={hour}>
              <div className="timeCell">{hourLabel(hour)}</div>
              {visibleDays.map((day) => {
                const slot = makeSlot(day, hour)
                return (
                  <div className="slotCell" key={slot.toISOString()}>
                    {renderSlotButton(slot)}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="mobileSchedule" aria-label="手机预约表">
        <div className="dayTabs" role="tablist" aria-label="选择日期">
          {visibleDays.map((day, index) => (
            <button
              key={day.toISOString()}
              type="button"
              className={selectedMobileDay === index ? 'activeDayTab' : ''}
              onClick={() => setSelectedMobileDay(index)}
              role="tab"
              aria-selected={selectedMobileDay === index}
            >
              <span>{format(day, 'EEE', { locale: zhCN })}</span>
              <strong>{format(day, 'd')}</strong>
            </button>
          ))}
        </div>

        <div className="mobileDayTitle">
          <h2>
            {format(visibleDays[selectedMobileDay], 'M月d日 EEEE', {
              locale: zhCN,
            })}
          </h2>
          {isSameDay(visibleDays[selectedMobileDay], new Date()) && <span>今天</span>}
        </div>

        <div className="mobileSlotList">
          {HOURS.map((hour) => {
            const slot = makeSlot(visibleDays[selectedMobileDay], hour)
            const reservation = reservations[slotKey(slot)]

            return (
              <div className="mobileSlotRow" key={slot.toISOString()}>
                <span className="mobileTime">{hourLabel(hour)}</span>
                {renderSlotButton(slot, true)}
                {reservation && (
                  <Trash2 className="deleteHint" size={16} aria-hidden="true" />
                )}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export default App
