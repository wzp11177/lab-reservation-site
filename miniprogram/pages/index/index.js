const USERS = ['王志鹏', '周子茹', '张正梁']
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const SUPABASE_URL = 'https://nhjzugsqiqrfubyvichj.supabase.co'
const SUPABASE_KEY = 'sb_publishable_mEmVYPVjqttov3MERDKknw_2oy5HNX1'
const SELECTED_USER_KEY = 'lab-selected-user'
const CLEANUP_WEEK_KEY = 'cleanup_week_start'
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad(value) {
  return String(value).padStart(2, '0')
}

function hourLabel(hour) {
  return `${pad(hour)}:00`
}

function formatDate(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function formatWeekKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function startOfWeek(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  const day = next.getDay()
  const distance = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + distance)
  return next
}

function addDays(date, count) {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

function addWeeks(date, count) {
  return addDays(date, count * 7)
}

function makeSlot(day, hour) {
  const slot = new Date(day)
  slot.setHours(hour, 0, 0, 0)
  return slot
}

function slotKey(slot) {
  return new Date(slot).toISOString()
}

function encodeFilter(value) {
  return encodeURIComponent(value)
}

function requestSupabase(path, method = 'GET', data, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${SUPABASE_URL}/rest/v1/${path}`,
      method,
      data,
      header: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data)
          return
        }

        const message =
          response.data && response.data.message
            ? response.data.message
            : `请求失败：${response.statusCode}`
        reject(new Error(message))
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络请求失败'))
      },
    })
  })
}

Page({
  data: {
    users: USERS,
    selectedUser: USERS[0],
    weekOffset: 0,
    selectedDayIndex: 0,
    weekLabel: '',
    statusText: '准备中',
    errorText: '',
    isLoading: false,
    pendingSlot: '',
    days: [],
    slots: [],
    reservations: {},
  },

  onLoad() {
    const savedUser = wx.getStorageSync(SELECTED_USER_KEY)
    this.setData({
      selectedUser: USERS.includes(savedUser) ? savedUser : USERS[0],
    })
    this.bootstrap()
  },

  onPullDownRefresh() {
    this.refreshReservations().finally(() => wx.stopPullDownRefresh())
  },

  async bootstrap() {
    this.rebuildCalendar()
    await this.runWeeklyCleanup()
    await this.refreshReservations()
  },

  rebuildCalendar() {
    const currentWeekStart = startOfWeek(new Date())
    const visibleWeekStart = addWeeks(currentWeekStart, this.data.weekOffset)
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(visibleWeekStart, index)
      return {
        key: slotKey(date),
        date: date.toISOString(),
        weekday: WEEKDAYS[date.getDay()],
        day: date.getDate(),
      }
    })

    this.setData({
      weekLabel: `${formatDate(visibleWeekStart)} - ${formatDate(addDays(visibleWeekStart, 6))}`,
      days,
    })
    this.rebuildSlots()
  },

  rebuildSlots() {
    const day = new Date(this.data.days[this.data.selectedDayIndex].date)
    const slots = HOURS.map((hour) => {
      const slot = makeSlot(day, hour)
      const key = slotKey(slot)
      const reservation = this.data.reservations[key] || null
      return {
        key,
        time: hourLabel(hour),
        reservation,
        own: reservation && reservation.user_name === this.data.selectedUser,
      }
    })

    this.setData({ slots })
  },

  async runWeeklyCleanup() {
    const currentWeekStart = startOfWeek(new Date())
    const currentKey = formatWeekKey(currentWeekStart)

    try {
      const meta = await requestSupabase(
        `app_meta?select=value&key=eq.${CLEANUP_WEEK_KEY}`,
      )

      if (meta && meta[0] && meta[0].value === currentKey) {
        return
      }

      await requestSupabase(
        `reservations?slot_start=lt.${encodeFilter(currentWeekStart.toISOString())}`,
        'DELETE',
      )
      await requestSupabase(
        'app_meta',
        'POST',
        {
          key: CLEANUP_WEEK_KEY,
          value: currentKey,
          updated_at: new Date().toISOString(),
        },
        { Prefer: 'resolution=merge-duplicates' },
      )
    } catch (error) {
      this.setData({ errorText: error.message })
    }
  },

  async refreshReservations() {
    const rangeStart = startOfWeek(new Date())
    const rangeEnd = addWeeks(rangeStart, 2)

    this.setData({ isLoading: true, errorText: '' })

    try {
      const reservations = await requestSupabase(
        [
          'reservations?select=id,slot_start,user_name,created_at',
          `slot_start=gte.${encodeFilter(rangeStart.toISOString())}`,
          `slot_start=lt.${encodeFilter(rangeEnd.toISOString())}`,
          'order=slot_start.asc',
        ].join('&'),
      )
      const reservationMap = {}
      ;(reservations || []).forEach((reservation) => {
        reservationMap[slotKey(reservation.slot_start)] = reservation
      })

      this.setData({
        reservations: reservationMap,
        statusText: `已同步 ${hourLabel(new Date().getHours()).replace(':00', '')}:${pad(new Date().getMinutes())}`,
      })
      this.rebuildSlots()
    } catch (error) {
      this.setData({
        errorText: error.message,
        statusText: '同步失败',
      })
    } finally {
      this.setData({ isLoading: false })
    }
  },

  selectUser(event) {
    const user = event.currentTarget.dataset.user
    wx.setStorageSync(SELECTED_USER_KEY, user)
    this.setData({ selectedUser: user })
    this.rebuildSlots()
  },

  selectWeek(event) {
    this.setData({
      weekOffset: Number(event.currentTarget.dataset.offset),
      selectedDayIndex: 0,
    })
    this.rebuildCalendar()
  },

  selectDay(event) {
    this.setData({ selectedDayIndex: Number(event.currentTarget.dataset.index) })
    this.rebuildSlots()
  },

  tapSlot(event) {
    const key = event.currentTarget.dataset.key
    const reservation = this.data.reservations[key]

    if (reservation) {
      wx.showModal({
        title: '取消预约',
        content: `取消 ${reservation.user_name} 的 ${hourLabel(new Date(key).getHours())} 预约？`,
        confirmText: '取消预约',
        success: async (result) => {
          if (result.confirm) {
            await this.cancelReservation(reservation.id, key)
          }
        },
      })
      return
    }

    this.createReservation(key)
  },

  async createReservation(slotStart) {
    this.setData({ pendingSlot: slotStart, errorText: '' })

    try {
      await requestSupabase(
        'reservations',
        'POST',
        {
          slot_start: slotStart,
          user_name: this.data.selectedUser,
        },
        { Prefer: 'return=representation' },
      )
      await this.refreshReservations()
    } catch (error) {
      this.setData({
        errorText: error.message.includes('duplicate')
          ? '该时段已被预约'
          : error.message,
      })
    } finally {
      this.setData({ pendingSlot: '' })
    }
  },

  async cancelReservation(id, slotStart) {
    this.setData({ pendingSlot: slotStart, errorText: '' })

    try {
      await requestSupabase(`reservations?id=eq.${id}`, 'DELETE')
      await this.refreshReservations()
    } catch (error) {
      this.setData({ errorText: error.message })
    } finally {
      this.setData({ pendingSlot: '' })
    }
  },
})
