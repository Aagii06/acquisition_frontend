import axios from 'axios'
import { toast } from 'sonner'
import { authStorage } from './auth'
import { notifyRequestStart, notifyRequestEnd } from './blocking-loader-state'
import { logger } from './logger'

// Нэг дор олон 401/403 toast гарахаас сэргийлнэ
let _authAlertPending = false
function showAccessDenied(title: string, description: string, withLoginBtn = false) {
  if (_authAlertPending) return
  _authAlertPending = true
  const opts = withLoginBtn
    ? {
        description,
        duration: Infinity as number,
        action: {
          label: 'Нэвтрэх',
          onClick: () => { window.location.href = '/login' },
        },
        onDismiss: () => { _authAlertPending = false },
      }
    : {
        description,
        duration: 7000,
        onDismiss: () => { _authAlertPending = false },
        onAutoClose: () => { _authAlertPending = false },
      }
  toast.error(title, opts)
}

// Backend-ийн алдааны биеэс хэрэглэгчид зориулсан мессежийг гаргана.
//
// Бүх алдаа `{code, error, message}` JSON байх ёстой ч proxy/gateway дундаас
// HTML эсвэл цэвэр текст ирж болно (ж: gin-ийн хуучин "404 page not found").
// Тийм үед биеийг ХЭРЭГЛЭХГҮЙ — хэрэглэгчид техникийн хог харуулахгүй.
function serverMessage(error: unknown): string | undefined {
  const data = (error as { response?: { data?: unknown } })?.response?.data
  if (!data || typeof data !== 'object') return undefined
  const { error: e, message: m } = data as { error?: unknown; message?: unknown }
  const msg = typeof e === 'string' && e ? e : typeof m === 'string' && m ? m : undefined
  return msg?.trim() || undefined
}

// 404 нь "сервер унасан" биш — хүсэлт хүрсэн, зүгээр л мэдээлэл байхгүй.
// Өмнө нь interceptor-т 404-ийн салбар БАЙХГҮЙ байсан тул дуудсан код бүр
// өөрийн ерөнхий fallback-ыг харуулж, хэрэглэгчид "сервертэй холбогдоход
// алдаа" мэт төөрөгдүүлсэн мессеж хүрдэг байв.
let _notFoundAlertPending = false
function showNotFound(description?: string) {
  if (typeof window === 'undefined' || _notFoundAlertPending) return
  _notFoundAlertPending = true
  const clear = () => { _notFoundAlertPending = false }
  toast.warning('Мэдээлэл олдсонгүй', {
    description: description ?? 'Хүссэн мэдээлэл байхгүй эсвэл устгагдсан байна.',
    duration: 6000,
    onDismiss: clear,
    onAutoClose: clear,
  })
}

import type { BasemapSetting } from '@/components/map/basemap-config'
import type {
  ApiResponse, PaginatedResponse, LoginResponse,
  User, Role, Permission, Menu,
  Organization, Department, Position, Person, Employee,
  ValuationOrg, ValuationOrgPayload,
  AuditLog,
  FinanceDashboardData, FinanceDashboardFilter,
  Plan, LandAcquisition, LandAcquisitionUpdateResult, LandAcquisitionFilter, LandAcquisitionOption, AU2Option, Parcel, ParcelFull, ParcelDiscoveryResult,
  AcquisitionProgress, AcquisitionSocioSurvey, ParcelSurvey, ParcelSurveyInput, ParcelSurveyRow, ParcelSurveySummary, Document, StatusOption, ParcelNoticeEmail, ParcelEMongoliaNotice,
  ParcelEstimatedValueHistory,
  GlobalParcel, ParcelPayment, Asset, Compensation, CompensationGrant, GlobalCompensation,
  ConstructionType, AcquisitionCategory, ReportParcelRow, ReportSummary, ParcelStatus, DocumentType,
  AcquisitionAssignee, ParcelWorkflow, ParcelStatusHistory, ParcelStatusRequirement, ParcelStatusRules, BoundaryHistory, BoundaryPreview, BoundaryOutsideParcel, FundingSource,
  CompensationHistory, ParcelHolder, RepresentativeInput, ParcelDocumentSyncResult, ParcelHolderSyncResult, ParcelBasePrice, ParcelInvoiceSyncResult, ParcelFeeSyncResult, ParcelSyncCountResult, LandValuation, LandValuationUpsert, ValuationImportPayload, ValuationImportResult, ValuationSectionNote, ValuationNotesPayload, AssetSpec, AssetCalculation,
  DroneImage,
  DroneUploadTicket,
  ValuationSubmission, ValuationSubmissionHistory, ValuationSnapshot,
  AssetSpecType, AssetCalcType,
  DecisionDraft, DecisionDraftParcel, DecisionDraftFundingLink, DecisionDraftProgressHistory, DecisionOption, FundingSourceOption,
  LandRelease, LandReleaseFeature, LandReleaseFilter, LandReleaseMapItem, LandReleaseStats, LandReleaseStructureType,
} from '@/types'

// Backend алдаа / timeout / сүлжээ тасрах үед хэрэглэгчийг хуудаснаас ХӨӨХГҮЙ.
//
// Өмнө нь дурын 5xx эсвэл timeout бүтэн апп-ыг /server-error руу шиддэг байсан:
// жижиг алдаа (нэг график, нэг жагсаалт унасан) ч хэрэглэгчийн бөглөж байсан
// форм, сонголтыг үгүй хийж байв. Одоо зөвхөн НЭГ анхааруулга харуулна —
// бусад хэсэг ажиллаж, хэрэглэгч ажлаа үргэлжлүүлнэ.
//
// /server-error хуудас нь зөвхөн frontend хуудас байхгүй/эвдэрсэн үед
// (app/not-found.tsx, app/error.tsx) хэрэглэгдэнэ.
let _serverAlertPending = false
function showServerError(description: string) {
  if (typeof window === 'undefined' || _serverAlertPending) return
  _serverAlertPending = true
  toast.error('Серверт холбогдоход алдаа гарлаа', {
    description,
    duration: 7000,
    action: {
      label: 'Дахин ачаалах',
      onClick: () => window.location.reload(),
    },
    onDismiss: () => { _serverAlertPending = false },
    onAutoClose: () => { _serverAlertPending = false },
  })
}

const api = axios.create({ baseURL: '/api/v1', timeout: 30000, headers: { 'Accept-Language': 'mn' } })

type ParcelListParams = {
  page?: number
  page_size?: number
  parcel_id?: string
  right_type?: number
  landuse?: string
  au3_code?: string
  acquisition_id?: string
  acquisition_name?: string
  plan_code?: string
  status?: number
  status_id?: number
  /** Чөлөөлөлтийн ЕРӨНХИЙ ангилал. */
  general_category_id?: number
  unlinked_only?: boolean
  /** Зөвхөн «Захирамжид холбогдоно» (is_released) төлөвтэй. */
  released_only?: boolean
  years?: number[]
  /** Эрэмбэлэх багана (backend-ийн зөвшөөрөгдсөн түлхүүр) ба чиглэл. */
  sort?: string
  order?: 'asc' | 'desc'
}

type ReportListParams = {
  page?: number
  page_size?: number
  acquisition_id?: string
  acquisition_name?: string
  plan_code?: string
  au3_code?: string
  right_type?: number
  landuse?: string
  years?: number[]
  compensation_type?: string
  general_category_id?: number
  sub_category_id?: number
  sort?: string
  order?: 'asc' | 'desc'
}

type LegacyParcel = Omit<Parcel, 'right_type' | 'compensation_paid'> & {
  right_type: number | string
  compensation_paid?: boolean
}

const LEGACY_RIGHT_TYPES: Record<string, number> = {
  USE: 1,
  USAGE: 1,
  LEASE: 2,
  POSSESSION: 2,
  OWNERSHIP: 3,
}

function normalizeRightType(value: number | string): number {
  if (typeof value === 'number') return value
  const numeric = Number(value)
  if (!Number.isNaN(numeric)) return numeric
  return LEGACY_RIGHT_TYPES[value.toUpperCase()] ?? 0
}

function parcelListSearchParams(params?: ParcelListParams): URLSearchParams {
  const q = new URLSearchParams()
  if (!params) return q

  if (params.page) q.set('page', String(params.page))
  if (params.page_size) q.set('page_size', String(params.page_size))
  if (params.parcel_id) q.set('parcel_id', params.parcel_id)
  if (params.right_type) q.set('right_type', String(params.right_type))
  if (params.landuse) q.set('landuse', params.landuse)
  if (params.au3_code) q.set('au3_code', params.au3_code)
  if (params.acquisition_id) q.set('acquisition_id', params.acquisition_id)
  if (params.acquisition_name) q.set('acquisition_name', params.acquisition_name)
  if (params.plan_code) q.set('plan_code', params.plan_code)
  if (params.status != null) q.set('status', String(params.status))
  if (params.status_id != null) q.set('status_id', String(params.status_id))
  if (params.general_category_id) q.set('general_category_id', String(params.general_category_id))
  if (params.unlinked_only) q.set('unlinked_only', 'true')
  if (params.released_only) q.set('released_only', 'true')
  if (params.sort) q.set('sort', params.sort)
  if (params.order) q.set('order', params.order)
  params.years?.forEach(year => q.append('year', String(year)))

  return q
}

async function listParcelsFromAcquisitions(params?: ParcelListParams): Promise<PaginatedResponse<GlobalParcel>> {
  const page = params?.page ?? 1
  const pageSize = params?.page_size ?? 20
  const acqPageSize = 100

  const fetchAcquisitions = async (pageNo: number) =>
    api.get<PaginatedResponse<LandAcquisition>>('/land-acquisitions', {
      params: { page: pageNo, page_size: acqPageSize, status: params?.status || undefined },
    }).then(r => r.data)

  const firstAcqPage = await fetchAcquisitions(1)
  const otherAcqPages = firstAcqPage.total_pages > 1
    ? await Promise.all(
        Array.from({ length: firstAcqPage.total_pages - 1 }, (_, i) => fetchAcquisitions(i + 2)),
      )
    : []

  const acquisitions = [firstAcqPage, ...otherAcqPages]
    .flatMap(r => r.data)
    .filter(acq => {
      if (params?.acquisition_id && acq.id !== params.acquisition_id) return false
      const name = params?.acquisition_name?.trim().toLowerCase()
      if (name && !(acq.acquisition_name ?? '').toLowerCase().includes(name)) return false
      const plan = params?.plan_code?.trim().toLowerCase()
      if (plan && !(acq.plan_code ?? '').toLowerCase().includes(plan)) return false
      return true
    })

  const parcelPages = await Promise.all(acquisitions.map(async (acq) => {
    const res = await api.get<PaginatedResponse<LegacyParcel>>(`/land-acquisitions/${acq.id}/parcels`, {
      params: {
        page: 1,
        page_size: 1000,
        parcel_id: params?.parcel_id || undefined,
        landuse: params?.landuse || undefined,
      },
    }).then(r => r.data)

    return res.data.map((parcel): GlobalParcel => ({
      ...parcel,
      right_type: normalizeRightType(parcel.right_type),
      compensation_paid: parcel.compensation_paid ?? false,
      acquisition_id: acq.id,
      acquisition_name: acq.acquisition_name,
      plan_code: acq.plan_code,
      acquisition_status: acq.status,
      start_date: acq.start_date,
      end_date: acq.end_date,
      status_id: parcel.status ?? 0,
      status_name: parcel.status_name ?? "",
      cash_amount: parcel.cash_amount ?? 0,
      land_grant_amount: parcel.land_grant_amount ?? 0,
      land_grant_count: parcel.land_grant_count ?? 0,
    }))
  }))

  // «Захирамжид холбогдоно» төлөвүүд — бүртгэлийн дүрмээс (is_released); кодонд
  // төлөвийн id хатуу бичихгүй.
  const releasedIds = params?.released_only
    ? new Set((await parcelStatusApi.list()).filter(s => s.is_released).map(s => s.id))
    : null

  const filtered = parcelPages.flat().filter(parcel => {
    if (params?.right_type && parcel.right_type !== params.right_type) return false
    if (params?.au3_code && parcel.au3_code !== params.au3_code) return false
    if (params?.status_id && parcel.status_id !== params.status_id) return false
    if (releasedIds && !releasedIds.has(parcel.status_id)) return false
    return true
  })

  const total = filtered.length
  const start = (page - 1) * pageSize

  return {
    code: 200,
    data: filtered.slice(start, start + pageSize),
    message: firstAcqPage.message,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

// _silent: true — арын хүсэлтүүд (мэдэгдлийн poll г.м.) бүтэн дэлгэцийн
// блоклогч loader-ийг асаахгүй байх тохиргоо.
//
// _allow404: true — 404-ийг ХҮЛЭЭГДЭЖ БУЙ хариу гэж үзэх дуудалтууд (дуудсан
// код өөрөө fallback хийдэг). Зөвхөн "Мэдээлэл олдсонгүй" анхааруулгыг
// унтраана — loader болон бусад зан төлөв хэвээр.
//
// _allow403: true — 403 нь ХҮЛЭЭГДЭЖ БУЙ хариу байх дуудалтууд. Жишээ:
// газрын зураг дээрх хилийн давхарга нь ӨӨРИЙН БИШ чөлөөлөлтийг ч ЗОРИУД
// харуулдаг (v_plan_acquisition = нэг төлөвлөгөөний бүх чөлөөлөлт) тул тэдгээр
// дээр дарах нь хэвийн үйлдэл. Глобал "Энэ үйлдлийг гүйцэтгэх эрх байхгүй"
// анхааруулга нь хэрэглэгчийг ТӨӨРӨГДҮҮЛНЭ — дуудсан код өөрөө тохирох
// мессежээ харуулна. Логлолт хэвээр (алдааг нуухгүй).
declare module 'axios' {
  export interface AxiosRequestConfig {
    _silent?: boolean
    _allow404?: boolean
    _allow403?: boolean
    /** 401-ийн дараа нэг л удаа дахин оролдох тэмдэглэгээ. */
    _retry?: boolean
    /** blocking-loader-ийн энэ оролдлогод харгалзах id (silent бол undefined). */
    _loaderId?: number
  }
}

api.interceptors.request.use((config) => {
  const token = authStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  // Эрхийн шалгалтыг backend (/prof group + middleware) дээр төвлөрүүлсэн.
  // Frontend талд урьдчилсан allowlist хийхгүй — false 403 (Хандах эрхгүй)
  // toast гарахаас сэргийлж, backend-тэй зөрчилдөхөөс зайлсхийнэ.
  //
  // 401-ийн дараах дахин оролдлого нь ИЖИЛ config-оор энэ interceptor-т дахин
  // ирдэг тул ШИНЭ id авна — өмнөх id нь аль хэдийн хаагдсан.
  // GET нь контентын хэсэгт л loader харуулна; өөрчлөх хүсэлт бүтэн дэлгэцийг
  // түгжинэ (давхар илгээхээс сэргийлнэ).
  const kind = (config.method ?? 'get').toLowerCase() === 'get' ? 'read' : 'write'
  config._loaderId = config._silent ? undefined : notifyRequestStart(kind)
  return config
})

// ── Токен шинэчлэх: single-flight + хугацааны хязгаартай ────────────────────
//
// Хуудас дахин ачаалахад нэг дор 10-15 хүсэлт явдаг. Access token хугацаа
// дууссан бол тэд БҮГД зэрэг 401 авна. Урьд нь тус бүр өөрийн
// `/auth/refresh`-ээ ИЖИЛ refresh token-оор явуулдаг байсан: backend refresh
// token-оо эргүүлдэг тул ЭХНИЙХ нь амжилттай болж, үлдсэн нь бүтэлгүйтээд
// `authStorage.clear()` дуудан саяхан хадгалсан ШИНЭ токеныг устгадаг байв.
// Үр дүнд нь хуудас хагас ачаалагдаад зогсох, эсвэл /login руу шидэгддэг —
// яг "нэг хуудсан дээр удаан байгаад дахин ачаалахад" илэрдэг алдаа.
//
// Мөн тэр дуудлага нүцгэн `axios`-оор явдаг тул instance-ийн 30 сек timeout
// ХАМААРДАГГҮЙ (axios-ийн анхдагч нь `0` = хязгааргүй). Backend/proxy гацвал
// promise хэзээ ч settle хийхгүй, react-query-ийн query мөнхөд `pending`
// үлдэж, хэрэглэгч төгсгөлгүй skeleton хардаг байлаа.
// Энэ функц нь axios interceptor-оос ГАДНА мэдэгдлийн SSE стрийм (нүцгэн
// `fetch`-ээр явдаг тул interceptor хамардаггүй) болон урьдчилан сэргээх
// таймераас мөн дуудагддаг. Бүгд ЭНЭ нэг single-flight-ыг хуваалцаж байж
// refresh token нэг л удаа эргэнэ.
const REFRESH_TIMEOUT_MS = 15_000
let _refreshInFlight: Promise<string> | null = null

export function refreshAccessToken(): Promise<string> {
  if (_refreshInFlight) return _refreshInFlight

  const refreshToken = authStorage.getRefreshToken()
  if (!refreshToken) return Promise.reject(new Error('refresh token байхгүй'))

  _refreshInFlight = axios
    .post<{ data?: { access_token?: string; refresh_token?: string } }>(
      '/api/v1/auth/refresh',
      { refresh_token: refreshToken },
      { timeout: REFRESH_TIMEOUT_MS },
    )
    .then(({ data }) => {
      const access = data?.data?.access_token
      if (!access) throw new Error('refresh хариунд access_token алга')
      authStorage.setTokens(access, data.data?.refresh_token ?? refreshToken)
      return access
    })
    .finally(() => {
      _refreshInFlight = null
    })

  return _refreshInFlight
}

api.interceptors.response.use(
  (res) => {
    notifyRequestEnd(res.config._loaderId)
    // Амжилттай хүсэлт БҮРийг логлохгүй — өдөрт олон мянган (ихэнхдээ 200 OK)
    // бичлэг Loki руу урсаж, /api/client-log-ыг real API-тай ойролцоо тоогоор
    // дуудуулж байсан бол илт хэрэггүй чимээ. Зөвхөн алдааг доор логлоно.
    return res
  },
  async (error) => {
    notifyRequestEnd(error.config?._loaderId)

    const status = error.response?.status
    const isAuthRoute = error.config?.url?.startsWith('/auth/')

    if (!error.config?._silent) {
      logger.error('api request failed', {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        status,
        code: error.code,
        // Сервэрийн буцаасан аль хэдийн хэрэглэгчид зориулсан аюулгүй мессеж
        // (i18n-жуулсан) — хүсэлтийн бие/header-ийг хэзээ ч логлохгүй.
        error: error.response?.data?.error ?? error.response?.data?.message,
      })
    }

    // ── Хүсэлт цуцлагдсан (компонент unmount, шинэ хайлт) — алдаа биш, чимээгүй өнгөрөөнө ──
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return Promise.reject(error)
    }

    // ── Backend алдаа (5xx) / timeout / холбогдож чадсангүй ──────────────────
    // Хуудсыг ХАЯХГҮЙ: анхааруулга харуулж, алдааг дуудсан код өөрөө
    // (useQuery-ийн error state, mutation-ийн onError) шийднэ.
    const noResponse = !error.response // network error эсвэл timeout (ECONNABORTED)
    const isServerError = typeof status === 'number' && status >= 500
    if (!isAuthRoute && (noResponse || isServerError)) {
      // Арын (_silent) хүсэлтийн түр алдаанд анхааруулга харуулахгүй —
      // дараагийн poll дээр өөрөө сэргэнэ.
      if (!error.config?._silent) {
        showServerError(
          noResponse
            ? 'Сервер хариу өгсөнгүй эсвэл хүсэлт хугацаа хэтэрлээ. Түр хүлээгээд дахин оролдоно уу.'
            : serverMessage(error) ??
              'Сервер дээр алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.',
        )
      }
      return Promise.reject(error)
    }

    // ── 404: мэдээлэл олдсонгүй ────────────────────────────────────────────
    // Сервер хариу өгсөн тул холболтын алдаа БИШ. Backend-ийн мессежийг
    // (`Мэдээлэл олдсонгүй`) шууд харуулна. 404-ийг өөрөө шийддэг дуудалтууд
    // `_allow404` тэмдэглэгээгээр анхааруулгыг унтраана.
    if (status === 404 && !isAuthRoute) {
      if (!error.config?._silent && !error.config?._allow404) {
        showNotFound(serverMessage(error))
      }
      return Promise.reject(error)
    }

    // ── 403: хандах эрхгүй (backend эсвэл frontend access-policy) ──────────
    if (status === 403 && !isAuthRoute) {
      if (!error.config?._silent && !error.config?._allow403) {
        showAccessDenied('Хандах эрхгүй', 'Энэ үйлдлийг гүйцэтгэх эрх байхгүй байна.')
      }
      return Promise.reject(error)
    }

    // ── 401: нэвтрэх шаардлагатай ──────────────────────────────────────────
    if (status === 401 && !isAuthRoute) {
      // "Гарах" дарж storage цэвэрлэгдсэн (эсвэл нэвтрээгүй) үед үлдэгдэл
      // хүсэлтүүд 401 буцаадаг — энэ нь сесс дууссан хэрэг биш тул анхааруулга
      // харуулахгүйгээр чимээгүй login хуудас руу шилжинэ.
      if (!authStorage.getRefreshToken()) {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
      if (!error.config._retry) {
        // Нэг удаа token refresh хийж үзнэ
        error.config._retry = true

        // Зэрэг явсан өөр хүсэлт аль хэдийн шинэчилсэн бол ДАХИН refresh
        // хийхгүй — зүгээр л шинэ токеноор дахин оролдоно. Ингэснээр нэг
        // дор 401 авсан олон хүсэлт refresh token-ыг дэмий эргүүлэхгүй.
        const usedAuth = String(error.config.headers?.Authorization ?? '')
        const currentAccess = authStorage.getAccessToken()
        if (currentAccess && usedAuth !== `Bearer ${currentAccess}`) {
          error.config.headers.Authorization = `Bearer ${currentAccess}`
          return api(error.config)
        }

        try {
          const access = await refreshAccessToken()
          error.config.headers.Authorization = `Bearer ${access}`
          return api(error.config)
        } catch (refreshError) {
          // ӨӨР ТАБ зэрэг refresh хийсэн байж болно. Таб бүр өөрийн JS
          // төлөвтэй тул дээрх single-flight нь табуудын хооронд ажиллахгүй:
          // refresh token эргэдэг учир ХОЖСОН таб шинэ токеныг localStorage-д
          // бичсэн байхад ялагдсан нь 4xx авдаг. Storage дахь access token
          // СОЛИГДСОН бол сесс амьд хэвээр — цэвэрлэхгүй, шинэ токеноор л
          // дахин оролдоно (эс бөгөөс хоёр таб зэрэг гарч хаягддаг).
          const afterAccess = authStorage.getAccessToken()
          if (afterAccess && usedAuth !== `Bearer ${afterAccess}`) {
            error.config.headers.Authorization = `Bearer ${afterAccess}`
            return api(error.config)
          }

          // Сүлжээ тасрах / timeout-ыг "сесс дууссан" гэж үзэхгүй — тэгвэл
          // түр зуурын саатал хэрэглэгчийг гаргаж хаяна. ЗӨВХӨН backend
          // refresh token-ыг ТАТГАЛЗСАН (4xx) үед сессийг хаана.
          const refreshStatus = (refreshError as { response?: { status?: number } })?.response?.status
          if (typeof refreshStatus === 'number' && refreshStatus >= 400 && refreshStatus < 500) {
            authStorage.clear()
            showAccessDenied('Хандах эрхийн хугацаа дууссан', 'Дахин нэвтэрч орно уу.', true)
          } else {
            showServerError('Сервер хариу өгсөнгүй эсвэл хүсэлт хугацаа хэтэрлээ. Түр хүлээгээд дахин оролдоно уу.')
          }
          return Promise.reject(error)
        }
      }
      // Retry хийсний дараа ч 401 → хандах эрхгүй
      showAccessDenied('Хандах эрхгүй', 'Энэ үйлдлийг гүйцэтгэх эрх байхгүй байна.')
    }

    return Promise.reject(error)
  },
)

// ── Auth ────────────────────────────────────────────
// sdplatform схемийн ID-ууд int4 тул backend хэрэглэгчийн `id`-г ТОО болгож
// илгээдэг. Харин JWT-ээс уншсан `userId`, чөлөөлөлтийн `professional_org_id`
// зэрэг нь ТЭМДЭГТ МӨР. Хоёрыг шууд харьцуулбал (`12 === "12"`) үргэлж false
// болох тул хэрэглэгч уншсан бүр газарт ID-г мөр болгож жигдрүүлнэ.
function normalizeUser(raw: any): User {
  if (!raw) return raw
  const employee = raw.employee ? normalizeEmployee(raw.employee) : raw.employee
  return {
    ...raw,
    id: String(raw.id ?? raw.user_id ?? ''),
    employee_id: raw.employee_id == null ? undefined : String(raw.employee_id),
    employee,
  }
}

export const authApi = {
  // login нь нэвтрэх нэр ЭСВЭЛ имэйл — backend хоёуланг нь хүлээж авна.
  //
  // ДОТООД хэрэглэгч: backend үүнийг ЗӨВХӨН authdb (sdplatform.sd_user)-ээс
  // шалгана. Мэргэжлийн байгууллага энд нэвтрэхгүй — loginProf-ыг үз.
  login: (login: string, password: string) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', { username: login, password }).then(r => r.data.data),
  // МЭРГЭЖЛИЙН БАЙГУУЛЛАГА: бүртгэл нь өөр санд (appdb) амьдардаг тул
  // эндпойнт нь ч ТУСДАА. Хоёр сангийн хэрэглэгчийн дугаар мөргөлддөг учраас
  // backend дээр урсгалыг зориуд салгасан — нэг эндпойнтоос хоёуланг нь
  // хайвал нэг сангийн нэр нөгөөгийнхийг халхална.
  loginProf: (login: string, password: string) =>
    api.post<ApiResponse<LoginResponse>>('/auth/prof/login', { username: login, password }).then(r => r.data.data),
  // Refresh токеноо хамт илгээж хоёуланг нь хүчингүй болгоно
  logout: () => api.post('/auth/logout', { refresh_token: authStorage.getRefreshToken() }).then(r => r.data),
  me: () => api.get<ApiResponse<User>>('/users/me').then(r => normalizeUser(r.data.data)),
}

// ── Users ────────────────────────────────────────────
export const usersApi = {
  list: (params?: { page?: number; page_size?: number; search?: string; role?: string; is_active?: boolean; sort?: string; order?: 'asc' | 'desc' }) =>
    api.get<PaginatedResponse<User>>('/users', { params }).then(r => ({
      ...r.data,
      data: (r.data.data ?? []).map(normalizeUser),
    })),
  getById: (id: string) => api.get<ApiResponse<User>>(`/users/${id}`).then(r => normalizeUser(r.data.data)),
  // role_ids — backend хэрэглэгчийг үүсгэхтэй зэрэг ролиудыг оноож,
  // олгох эрхгүй роль дурдвал хэрэглэгчийг ҮҮСГЭХГҮЙ (хагас биелэхээс сэргийлнэ).
  create: (body: { username: string; email: string; password: string; first_name?: string; last_name?: string; position?: string; employee_id?: string; employee?: EmployeePayload; is_active?: boolean; role_ids?: string[] }) =>
    api.post<ApiResponse<User>>('/users', body).then(r => normalizeUser(r.data.data)),
  update: (id: string, body: Partial<{ username: string; email: string; first_name: string; last_name: string; position: string; is_active: boolean }>) =>
    api.put<ApiResponse<User>>(`/users/${id}`, body).then(r => normalizeUser(r.data.data)),
  changePassword: (id: string, password: string) =>
    api.put(`/users/${id}/password`, { password }),
  // Роль олгох/хураах нь тусдаа маршрут — backend дээр эрх нэмэгдүүлэлт болон
  // өөрийн ролийг өөрөө өөрчлөхөөс хамгаалсан шалгалттай.
  assignRole: (userId: string, roleId: string) =>
    api.post(`/users/${userId}/roles`, { role_id: roleId }),
  removeRole: (userId: string, roleId: string) =>
    api.delete(`/users/${userId}/roles/${roleId}`),
  delete: (id: string) => api.delete(`/users/${id}`),
}

export type HRListParams = {
  page?: number
  page_size?: number
  search?: string
  organization_id?: string
  department_id?: string
  is_active?: boolean
}

export type PersonPayload = Partial<Omit<Person, 'id' | 'created_at' | 'updated_at'>> & {
  person_type: 'citizen' | 'legal'
  register_no: string
}

export type EmployeePayload = Partial<Omit<Employee, 'id' | 'created_at' | 'updated_at' | 'person'>> & {
  person_id?: string
  person?: PersonPayload
  organization_id: string
  position_id: string
}

export type OrganizationPayload = Partial<Omit<Organization, 'id' | 'created_at' | 'updated_at'>> & { name: string }
export type DepartmentPayload = Partial<Omit<Department, 'id' | 'created_at' | 'updated_at'>> & { organization_id: string; name: string }
export type PositionPayload = Partial<Omit<Position, 'id' | 'created_at' | 'updated_at'>> & { name: string }

function numericHrId(value: string | number | null | undefined): string | number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : value
}

function employeeWritePayload(body: Partial<EmployeePayload>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...body }
  next.organization_id = numericHrId(body.organization_id)
  next.position_id = numericHrId(body.position_id)
  const departmentId = numericHrId(body.department_id)
  if (departmentId === undefined) delete next.department_id
  else next.department_id = departmentId
  const personId = numericHrId(body.person_id)
  if (personId === undefined) delete next.person_id
  else next.person_id = personId
  return next
}

export const organizationApi = {
  list: (params?: HRListParams) => api.get<PaginatedResponse<Organization>>('/organizations', { params }).then(r => r.data),
  create: (body: OrganizationPayload) => api.post<ApiResponse<Organization>>('/organizations', body).then(r => r.data.data),
  update: (id: string, body: Partial<OrganizationPayload>) => api.put<ApiResponse<Organization>>(`/organizations/${id}`, body).then(r => r.data.data),
  delete: (id: string) => api.delete(`/organizations/${id}`),
}

// sdplatform-ийн ID-ууд backend дээр int4 тул бичихдээ (POST/PUT) тоо болгож
// хөрвүүлнэ — унших үед мөр болгодог normalizeEmployee-ийн эсрэг чиглэл.
function toNumericId(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export const departmentApi = {
  list: (params?: HRListParams) => api.get<PaginatedResponse<Department>>('/departments', { params }).then(r => r.data),
  create: (body: DepartmentPayload) => api.post<ApiResponse<Department>>('/departments', { ...body, organization_id: toNumericId(body.organization_id) }).then(r => r.data.data),
  update: (id: string, body: Partial<DepartmentPayload>) => api.put<ApiResponse<Department>>(`/departments/${id}`, { ...body, organization_id: toNumericId(body.organization_id) }).then(r => r.data.data),
  delete: (id: string) => api.delete(`/departments/${id}`),
}

export const positionApi = {
  list: (params?: HRListParams) => api.get<PaginatedResponse<Position>>('/positions', { params }).then(r => r.data),
  create: (body: PositionPayload) => api.post<ApiResponse<Position>>('/positions', body).then(r => r.data.data),
  update: (id: string, body: Partial<PositionPayload>) => api.put<ApiResponse<Position>>(`/positions/${id}`, body).then(r => r.data.data),
  delete: (id: string) => api.delete(`/positions/${id}`),
}

export const personApi = {
  list: (params?: HRListParams) => api.get<PaginatedResponse<Person>>('/persons', { params }).then(r => r.data),
  create: (body: PersonPayload) => api.post<ApiResponse<Person>>('/persons', body).then(r => r.data.data),
  update: (id: string, body: Partial<PersonPayload>) => api.put<ApiResponse<Person>>(`/persons/${id}`, body).then(r => r.data.data),
  delete: (id: string) => api.delete(`/persons/${id}`),
}

// sdplatform-ийн ID-ууд int4 тул backend тоо буцаадаг — мөр болгож жигдрүүлнэ
// (харьцуулалт, Select-ийн value бүгд мөр дээр ажилладаг).
function normalizeEmployee(raw: any): Employee {
  if (!raw) return raw
  return {
    ...raw,
    id: String(raw.id ?? ''),
    person_id: String(raw.person_id ?? ''),
    user_id: raw.user_id == null ? undefined : String(raw.user_id),
    organization_id: raw.organization_id == null ? '' : String(raw.organization_id),
    department_id: raw.department_id == null ? undefined : String(raw.department_id),
    position_id: String(raw.position_id ?? ''),
  }
}

export const employeeApi = {
  list: (params?: HRListParams) => api.get<PaginatedResponse<Employee>>('/employees', { params }).then(r => ({
    ...r.data,
    data: (r.data.data ?? []).map(normalizeEmployee),
  })),
  getById: (id: string) => api.get<ApiResponse<Employee>>(`/employees/${id}`).then(r => normalizeEmployee(r.data.data)),
  create: (body: EmployeePayload) => api.post<ApiResponse<Employee>>('/employees', employeeWritePayload(body)).then(r => normalizeEmployee(r.data.data)),
  update: (id: string, body: Partial<EmployeePayload>) => api.put<ApiResponse<Employee>>(`/employees/${id}`, employeeWritePayload(body)).then(r => normalizeEmployee(r.data.data)),
  delete: (id: string) => api.delete(`/employees/${id}`),
}

// ── Үнэлгээний (мэргэжлийн) байгууллага ────────────────
//
// sdplatform схемийн ID-ууд int4 тул backend ТОО илгээдэг; харин чөлөөлөлт/
// нэгж талбарын `professional_org_id` / `independent_org_id` нь ТЭМДЭГТ МӨР
// хэлбэрээр ирдэг. Хоёрыг шууд харьцуулбал ("12" === 12) үргэлж false болох
// тул энд бүх ID-г мөр болгож жигдрүүлнэ.
function normalizeValuationOrgEmployee(raw: any): Employee {
  return {
    ...raw,
    id: String(raw?.id ?? ''),
    person_id: String(raw?.person_id ?? ''),
    organization_id: raw?.organization_id == null ? '' : String(raw.organization_id),
    department_id: raw?.department_id == null ? undefined : String(raw.department_id),
    position_id: String(raw?.position_id ?? ''),
  }
}

function normalizeValuationOrg(raw: any): ValuationOrg {
  return {
    ...raw,
    id: String(raw?.id ?? ''),
    employees: Array.isArray(raw?.employees)
      ? raw.employees.map(normalizeValuationOrgEmployee)
      : undefined,
  }
}

export const valuationOrgApi = {
  list: (params?: { search?: string; is_active?: boolean; page?: number; page_size?: number }) =>
    api.get<PaginatedResponse<ValuationOrg>>('/valuation-orgs', { params }).then(r => ({
      ...r.data,
      data: (r.data.data ?? []).map(normalizeValuationOrg),
    })),
  getById: (id: string) =>
    api.get<ApiResponse<ValuationOrg>>(`/valuation-orgs/${id}`).then(r => normalizeValuationOrg(r.data.data)),
  create: (body: ValuationOrgPayload) =>
    api.post<ApiResponse<ValuationOrg>>('/valuation-orgs', body).then(r => normalizeValuationOrg(r.data.data)),
  update: (id: string, body: ValuationOrgPayload) =>
    api.put<ApiResponse<ValuationOrg>>(`/valuation-orgs/${id}`, body).then(r => normalizeValuationOrg(r.data.data)),
  delete: (id: string) => api.delete(`/valuation-orgs/${id}`),
}

// ── Roles ─────────────────────────────────────────────
// Backend returns Go PascalCase fields; normalize to frontend camelCase
function normalizePermission(p: any): Permission {
  return {
    id: String(p.ID ?? p.id),
    code: p.Code ?? p.code,
    name: p.Name ?? p.name,
    action: p.Action ?? p.action,
    description: p.Description ?? p.description,
    resource: p.Resource ?? p.resource,
  }
}

function normalizeMenu(m: any): Menu {
  const rawPerms: unknown[] = m.Permissions ?? m.permissions ?? []
  return {
    id: String(m.ID ?? m.id),
    code: m.Code ?? m.code,
    name: m.Name ?? m.name,
    parent_id: m.ParentID ?? m.parent_id ? String(m.ParentID ?? m.parent_id) : undefined,
    parent_code: m.ParentCode ?? m.parent_code,
    menu_url: m.URL ?? m.menu_url,
    menu_icon: m.Icon ?? m.menu_icon,
    sort_order: m.SortOrder ?? m.sort_order,
    permissions: rawPerms.map(normalizePermission),
  }
}

function normalizeRole(r: any): Role {
  const rawPerms: unknown[] = r.Permissions ?? r.permissions ?? []
  const rawMenus: unknown[] = r.Menus ?? r.menus ?? []
  return {
    id: String(r.ID ?? r.id),
    code: r.Code ?? r.code,
    name: r.Name ?? r.name,
    resource: r.Resource ?? r.resource,
    description: r.Description ?? r.description,
    permissions: rawPerms.map(normalizePermission),
    menus: rawMenus.map(normalizeMenu),
  }
}

export const rolesApi = {
  list: () =>
    api.get<PaginatedResponse<Role>>('/roles').then(r => ({
      ...r.data,
      data: (r.data.data ?? []).map(normalizeRole),
    })),
  getById: (id: string) =>
    api.get<ApiResponse<Role>>(`/roles/${id}`).then(r => normalizeRole(r.data.data)),
  create: (body: { name: string; description?: string }) =>
    api.post<ApiResponse<Role>>('/roles', body).then(r => normalizeRole(r.data.data)),
  update: (id: string, body: { name?: string; description?: string }) =>
    api.put<ApiResponse<Role>>(`/roles/${id}`, body).then(r => normalizeRole(r.data.data)),
  delete: (id: string) => api.delete(`/roles/${id}`),
  assignPermission: (roleId: string, permissionId: string) =>
    api.post(`/roles/${roleId}/permissions`, { permission_id: permissionId }),
  removePermission: (roleId: string, permissionId: string) =>
    api.delete(`/roles/${roleId}/permissions/${permissionId}`),
  setMenuPermissions: (roleId: string, menuId: string, permissionIds: string[]) =>
    api.put(`/roles/${roleId}/menus/${menuId}/permissions`, { permission_ids: permissionIds }),
  removeMenu: (roleId: string, menuId: string) =>
    api.delete(`/roles/${roleId}/menus/${menuId}/permissions`),
}

export const menusApi = {
  list: () =>
    api.get<PaginatedResponse<Menu>>('/menus').then(r => ({
      ...r.data,
      data: (r.data.data ?? []).map(normalizeMenu),
    })),
  mine: () =>
    api.get<PaginatedResponse<Menu>>('/menus/me').then(r => ({
      ...r.data,
      data: (r.data.data ?? []).map(normalizeMenu),
    })),
}

// ── Permissions ───────────────────────────────────────
export const permissionsApi = {
  list: () =>
    api.get<PaginatedResponse<Permission>>('/permissions').then(r => ({
      ...r.data,
      data: (r.data.data ?? []).map(normalizePermission),
    })),
  create: (body: { name: string; description?: string }) =>
    api.post<ApiResponse<Permission>>('/permissions', body).then(r => normalizePermission(r.data.data)),
  delete: (id: string) => api.delete(`/permissions/${id}`),
}

export const auditApi = {
  list: (params?: {
    page?: number
    page_size?: number
    actor_id?: string
    action?: string
    resource_type?: string
    resource_id?: string
    acquisition_id?: string
    parcel_id?: string
    created_from?: string
    created_to?: string
    sort?: string
    order?: 'asc' | 'desc'
  }) =>
    api.get<PaginatedResponse<AuditLog>>('/audit-logs', { params }).then(r => r.data),
}

// ── Land Acquisitions ─────────────────────────────────
export const landApi = {
  listConstructionTypes: () =>
    api.get<ApiResponse<ConstructionType[]>>('/construction-types').then(r => r.data.data),
  listCategories: (parentId?: number) =>
    api.get<ApiResponse<AcquisitionCategory[]>>('/acquisition-categories', {
      params: parentId !== undefined ? { parent_id: parentId } : undefined,
    }).then(r => r.data.data ?? []),
  list: (filter?: LandAcquisitionFilter) => {
    const p = new URLSearchParams()
    if (filter?.plan_code)           p.set('plan_code', filter.plan_code)
    if (filter?.acquisition_name)    p.set('acquisition_name', filter.acquisition_name)
    if (filter?.parcel_id)           p.set('parcel_id', filter.parcel_id)
    if (filter?.status)              p.set('status', String(filter.status))
    if (filter?.au2_code)            p.set('au2_code', filter.au2_code)
    if (filter?.au3_code)            p.set('au3_code', filter.au3_code)
    if (filter?.general_category_id) p.set('general_category_id', String(filter.general_category_id))
    if (filter?.sub_category_id)     p.set('sub_category_id', String(filter.sub_category_id))
    if (filter?.assigned_user_id)    p.set('assigned_user_id', filter.assigned_user_id)
    if (filter?.sort)                p.set('sort', filter.sort)
    if (filter?.order)               p.set('order', filter.order)
    if (filter?.page)                p.set('page', String(filter.page))
    if (filter?.page_size)           p.set('page_size', String(filter.page_size))
    filter?.years?.forEach(y => p.append('year', String(y)))
    return api.get<PaginatedResponse<LandAcquisition>>(`/land-acquisitions?${p}`).then(r => r.data)
  },
  suggest: (q: string) =>
    api.get<ApiResponse<{ id: string; acquisition_name: string; plan_code: string }[]>>(
      '/land-acquisitions/suggest', { params: { q } }
    ).then(r => r.data.data ?? []),
  // filterOptions — шүүлтүүрийн dropdown-д зориулсан ТУСДАА хөнгөн API.
  //
  // ЯАГААД list()-ыг ХЭРЭГЛЭХГҮЙ: `list({ page: 1, page_size: 200 })` нь үндсэн
  // жагсаалтын endpoint-ыг дуудаж, backend тэнд мөр тутамд
  // `(SELECT COUNT(*) FROM parcel …)` + acquisition_category + sdplatform join
  // хийж 25+ багана буцаадаг. Нэгж талбарын өгөгдөл өсөх тутам 200 мөрийн тэр
  // хүсэлт axios-ийн 30 секундын timeout-д ороод "Серверт холбогдоход алдаа
  // гарлаа" toast гаргадаг байв (дээр нь react-query 2 удаа дахин оролддог).
  // Энэ endpoint нь зөвхөн land_acquisition хүснэгтээс 4 багана уншина.
  filterOptions: () =>
    api.get<ApiResponse<LandAcquisitionOption[]>>(
      '/land-acquisitions/filter-options'
    ).then(r => r.data.data ?? []),
  // Шүүлтүүрийн сум/дүүрэг — чөлөөлөлт БҮРТГЭГДСЭН дүүргүүд л ирнэ
  // (land_acquisition_au). Хоосон сонголт харагдахгүй.
  listDistricts: () =>
    api.get<ApiResponse<AU2Option[]>>('/land-acquisitions/districts').then(r => r.data.data ?? []),
  // allow403 — 403-ыг ХҮЛЭЭЖ БУЙ дуудагчид (газрын зураг дээрх хилийн цонх нь
  // өөрийн БИШ чөлөөлөлт дээр ч нээгддэг). Глобал "Хандах эрхгүй" анхааруулга
  // гарахгүй; дуудагч өөрөө тохирох мессежээ харуулна.
  getById: (id: string, opts?: { allow403?: boolean }) =>
    api
      .get<ApiResponse<LandAcquisition>>(`/land-acquisitions/${id}`, {
        _allow403: opts?.allow403,
      })
      .then(r => r.data.data),
  create: (data: FormData) =>
    api.post<ApiResponse<LandAcquisition>>('/land-acquisitions', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data),
  // Хил солиход backend нь ГУС-аас нэгж талбар ТАТАХГҮЙ (шинэ хилийн нэгж
  // талбарыг discoverParcels-ээр тусад нь татна) тул ердийн хугацааны хязгаар.
  update: (id: string, data: FormData) =>
    api.put<ApiResponse<LandAcquisitionUpdateResult>>(`/land-acquisitions/${id}`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data),
  // Гараас оруулах хилийг ХАДГАЛАЛГҮЙ шалгуулна: хилийн WKT (зураг дээр
  // харуулах), төлөвлөгөөний хилээс хэдэн хувиар зөрсөн, шинэ хилээс гарах
  // нэгж талбарууд (outside_parcels) буцна.
  //
  // ЯАГААД сервер рүү: .shp-г browser дээр задлавал проекц/полигоны шалгалт,
  // талбайн тооцоо (UTM) хоёулаа хоёр газар давхардаж, дэлгэц дээрх тоо
  // серверийн шийдвэрээс зөрөх эрсдэлтэй.
  previewBoundary: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('shapefile', file);
    return api.post<ApiResponse<BoundaryPreview>>(`/land-acquisitions/${id}/boundary-preview`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data);
  },
  // Төлөвлөгөөний дугаараар хил солихын ӨМНӨ: шинэ хилтэй ОГТ давхцахгүй болох
  // нэгж талбарууд (ХАДГАЛАЛГҮЙ, юу ч өөрчлөхгүй).
  boundaryOutsideParcels: (id: string, geometryWKT: string) =>
    api.post<ApiResponse<{ outside_parcels: BoundaryOutsideParcel[] }>>(
      `/land-acquisitions/${id}/boundary-outside-parcels`,
      { geometry_wkt: geometryWKT },
    ).then(r => r.data.data?.outside_parcels ?? []),
  delete: (id: string) => api.delete(`/land-acquisitions/${id}`),
  // has_overlap — БАЙРШЛААР давхардсан эсэхээр шүүнэ: "1" зөвхөн давхардалтай,
  // "0" зөвхөн давхардалгүй, заахгүй бол бүгд.
  getParcels: (id: string, params?: { page?: number; page_size?: number; parcel_id?: string; au1_code?: string; au2_code?: string; au3_code?: string; right_type?: number; landuse?: string; status_id?: number; has_overlap?: string; sort?: string; order?: 'asc' | 'desc' }) =>
    api.get<PaginatedResponse<Parcel>>(`/land-acquisitions/${id}/parcels`, { params }).then(r => r.data),
  getAssets: (id: string, params?: { page?: number; page_size?: number; parcel_id?: string; valuation_type?: string }) =>
    api.get<PaginatedResponse<Asset>>(`/land-acquisitions/${id}/assets`, { params }).then(r => r.data),
  createAsset: (acqId: string, body: Partial<Asset>) =>
    api.post<ApiResponse<Asset>>(`/land-acquisitions/${acqId}/assets`, body).then(r => r.data.data),
  updateAsset: (acqId: string, assetId: string, body: Partial<Asset>) =>
    api.put<ApiResponse<Asset>>(`/land-acquisitions/${acqId}/assets/${assetId}`, body).then(r => r.data.data),
  deleteAsset: (acqId: string, assetId: string) =>
    api.delete(`/land-acquisitions/${acqId}/assets/${assetId}`),
  listAssetSpecs: (acqId: string, assetId: string) =>
    api.get<ApiResponse<AssetSpec[]>>(`/land-acquisitions/${acqId}/assets/${assetId}/specs`).then(r => r.data.data ?? []),
  upsertAssetSpecs: (acqId: string, assetId: string, specs: { spec_type_id: number; value: string }[]) =>
    api.post(`/land-acquisitions/${acqId}/assets/${assetId}/specs`, { specs }),
  listAssetCalculations: (acqId: string, assetId: string) =>
    api.get<ApiResponse<AssetCalculation[]>>(`/land-acquisitions/${acqId}/assets/${assetId}/calculations`).then(r => r.data.data ?? []),
  // `group` — Excel дэх мөрийн бүлэг (Итгэлцүүр г.м). Хоосон илгээвэл
  // хадгалагдсан бүлэг хэвээр үлдэнэ (зөвхөн тоо засахад алдагдахгүй).
  upsertAssetCalculations: (acqId: string, assetId: string, calculations: { calc_type_id: number; unit: string; value: number; group?: string }[]) =>
    api.post(`/land-acquisitions/${acqId}/assets/${assetId}/calculations`, { calculations }),
  getLandValuation: (acqId: string, parcelId: string, valuationType?: string) =>
    api.get<ApiResponse<LandValuation | null>>(`/land-acquisitions/${acqId}/land-valuation`, { params: { parcel_id: parcelId, valuation_type: valuationType } }).then(r => r.data.data ?? null),
  upsertLandValuation: (acqId: string, body: LandValuationUpsert) =>
    api.post<ApiResponse<LandValuation>>(`/land-acquisitions/${acqId}/land-valuation`, body).then(r => r.data.data),
  deleteLandValuation: (acqId: string, parcelId: string, valuationType?: string) =>
    api.delete(`/land-acquisitions/${acqId}/land-valuation`, { params: { parcel_id: parcelId, valuation_type: valuationType } }).then(() => undefined),
  importValuation: (acqId: string, body: ValuationImportPayload) =>
    api.post<ApiResponse<ValuationImportResult>>(`/land-acquisitions/${acqId}/valuation-import`, body).then(r => r.data.data),
  // Үнэлгээний хүснэгт бүрийн тайлбар
  listValuationNotes: (acqId: string, parcelId: string, valuationType?: string) =>
    api.get<ApiResponse<ValuationSectionNote[]>>(`/land-acquisitions/${acqId}/valuation-notes`, {
      params: { parcel_id: parcelId, valuation_type: valuationType || undefined },
    }).then(r => r.data.data ?? []),
  saveValuationNotes: (acqId: string, body: ValuationNotesPayload) =>
    api.put<ApiResponse<ValuationSectionNote[]>>(`/land-acquisitions/${acqId}/valuation-notes`, body).then(r => r.data.data ?? []),
  listCompensations: (acqId: string, parcelId?: string, valuationType?: string) =>
    api.get<ApiResponse<Compensation[]>>(`/land-acquisitions/${acqId}/compensations`, {
      params: { parcel_id: parcelId || undefined, valuation_type: valuationType || undefined },
    }).then(r => r.data.data ?? []),
  createCompensation: (acqId: string, body: Partial<Compensation>) =>
    api.post<ApiResponse<Compensation>>(`/land-acquisitions/${acqId}/compensations`, body).then(r => r.data.data),
  updateCompensation: (acqId: string, compId: string, body: Partial<Compensation>) =>
    api.put<ApiResponse<Compensation>>(`/land-acquisitions/${acqId}/compensations/${compId}`, body).then(r => r.data.data),
  deleteCompensation: (acqId: string, compId: string) =>
    api.delete(`/land-acquisitions/${acqId}/compensations/${compId}`),
  approveCompensation: (acqId: string, compId: string, note: string) =>
    api.post(`/land-acquisitions/${acqId}/compensations/${compId}/approve`, { note }),
  rejectCompensation: (acqId: string, compId: string, note: string) =>
    api.post(`/land-acquisitions/${acqId}/compensations/${compId}/reject`, { note }),
  uploadCompensationReport: (acqId: string, compId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post<ApiResponse<Compensation>>(`/land-acquisitions/${acqId}/compensations/${compId}/report`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data)
  },
  uploadAssetPhoto: (acqId: string, assetId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post<ApiResponse<{ photo_pdf_url: string; photo_pdf_name: string }>>(
      `/land-acquisitions/${acqId}/assets/${assetId}/photos`, fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ).then(r => r.data.data)
  },
  listCompensationHistory: (acqId: string, compId: string) =>
    api.get<ApiResponse<CompensationHistory[]>>(`/land-acquisitions/${acqId}/compensations/${compId}/history`).then(r => r.data.data ?? []),
  // Нөхөх олговрын үнэлгээний илгээх/зөвшөөрөх төлөв
  // ТӨСӨӨЛЛИЙН үнэлгээ — value=null бол арилгана (талбарыг үргэлж илгээнэ:
  // "огт өгөөгүй" ба "арилга" хоёрыг backend ялгадаг).
  // confidencePercent undefined = ИТГЭЛЦҮҮРГҮЙ (өмчлөх эрхийн газар) — талбарыг
  // огт илгээхгүй. `value` талбар байхгүй тул backend тооцоолох салаа руу орно.
  //
  // file — тооцооллыг гэрчлэх ЗААВАЛ БИШ хавсралт (PDF эсвэл зураг). Файлтай
  // үед multipart-аар явна: үнэлгээ ба хавсралт НЭГ хүсэлтэд хадгалагдана.
  calculateParcelEstimatedValue: (acqId: string, parcelId: string, confidencePercent?: number, baseFeePerM2?: number, file?: File | null) => {
    const url = `/land-acquisitions/${acqId}/parcels/${parcelId}/estimated-value`
    type Result = ApiResponse<{ estimated_value: number; estimated_confidence_percent: number | null }>
    if (file) {
      const fd = new FormData()
      if (confidencePercent != null) fd.append('confidence_percent', String(confidencePercent))
      if (baseFeePerM2 != null) fd.append('base_fee_per_m2', String(baseFeePerM2))
      fd.append('file', file)
      return api.patch<Result>(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data.data)
    }
    return api.patch<Result>(url, {
      ...(confidencePercent != null ? { confidence_percent: confidencePercent } : {}),
      ...(baseFeePerM2 != null ? { base_fee_per_m2: baseFeePerM2 } : {}),
    }).then(r => r.data.data)
  },
  // ТӨСӨӨЛЛИЙН үнэлгээний өөрчлөлтийн түүх (шинэ → хуучин), хавсралттай.
  listParcelEstimatedValueHistory: (acqId: string, parcelId: string) =>
    api.get<ApiResponse<ParcelEstimatedValueHistory[]>>(
      `/land-acquisitions/${acqId}/parcels/${parcelId}/estimated-value/history`,
    ).then(r => r.data.data ?? []),
  setParcelEstimatedValue: (acqId: string, parcelId: string, value: number | null) =>
    api.patch<ApiResponse<{ estimated_value: number | null }>>(
      `/land-acquisitions/${acqId}/parcels/${parcelId}/estimated-value`,
      { value },
    ).then(r => r.data.data),
  getValuationSubmission: (acqId: string, parcelId: string, valuationType?: string) =>
    api.get<ApiResponse<ValuationSubmission>>(`/land-acquisitions/${acqId}/parcels/${parcelId}/valuation-status`, { params: { valuation_type: valuationType } }).then(r => r.data.data),
  // file — ЗААВАЛ БИШ хавсралт, ЗӨВХӨН буцаалтад (action="return") хамаарна.
  // Файлтай үед multipart-аар явна; үгүй бол өмнөх шигээ JSON.
  transitionValuationSubmission: (acqId: string, parcelId: string, action: "submit" | "approve" | "return" | "cancel", note: string, valuationType?: string, file?: File | null) => {
    const url = `/land-acquisitions/${acqId}/parcels/${parcelId}/valuation-status`
    if (file) {
      const fd = new FormData()
      fd.append('action', action)
      fd.append('note', note)
      if (valuationType) fd.append('valuation_type', valuationType)
      fd.append('file', file)
      return api.post<ApiResponse<ValuationSubmission>>(url, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data.data)
    }
    return api.post<ApiResponse<ValuationSubmission>>(url, { action, note, valuation_type: valuationType }).then(r => r.data.data)
  },
  listValuationSubmissionHistory: (acqId: string, parcelId: string, valuationType?: string) =>
    api.get<ApiResponse<ValuationSubmissionHistory[]>>(`/land-acquisitions/${acqId}/parcels/${parcelId}/valuation-status-history`, { params: { valuation_type: valuationType } }).then(r => r.data.data ?? []),
  listValuationSnapshots: (acqId: string, parcelId: string, valuationType?: string) =>
    api.get<ApiResponse<ValuationSnapshot[]>>(`/land-acquisitions/${acqId}/parcels/${parcelId}/valuation-snapshots`, { params: { valuation_type: valuationType } }).then(r => r.data.data ?? []),
  createCompensationGrant: (acqId: string, compId: string, body: Partial<CompensationGrant>) =>
    api.post<ApiResponse<CompensationGrant>>(`/land-acquisitions/${acqId}/compensations/${compId}/grant`, body).then(r => r.data.data),
  updateCompensationGrant: (acqId: string, compId: string, body: Partial<CompensationGrant>) =>
    api.put<ApiResponse<CompensationGrant>>(`/land-acquisitions/${acqId}/compensations/${compId}/grant`, body).then(r => r.data.data),
  deleteCompensationGrant: (acqId: string, compId: string) =>
    api.delete(`/land-acquisitions/${acqId}/compensations/${compId}/grant`),
  setParcelCompensation: (acqId: string, parcelId: string, paid: boolean) =>
    api.put(`/land-acquisitions/${acqId}/parcels/${parcelId}/compensation`, { paid }).then(r => r.data),
  listAllCompensations: (params?: { status?: string; search?: string; acquisition_id?: string; page?: number; page_size?: number; sort?: string; order?: 'asc' | 'desc' }) =>
    api.get<PaginatedResponse<GlobalCompensation>>('/compensations', { params }).then(r => r.data),
  getGlobalCompensation: (id: string) =>
    api.get<ApiResponse<GlobalCompensation>>(`/compensations/${id}`).then(r => r.data.data),
  getParcel: (acqId: string, parcelId: string) =>
    api.get<ApiResponse<ParcelFull>>(`/land-acquisitions/${acqId}/parcels/${parcelId}`).then(r => r.data.data),
  // Чөлөөлөх хилээр ГУС-аас нэгж талбарыг татаж бүртгэнэ: дугаар + бүртгэлийн
  // баганууд (геометр, талбай, зориулалт, хаяг) шууд орж ирнэ. ЭРХ ЗҮЙН
  // дэлгэрэнгүй татагдахгүй — түүнийг дугаар тус бүрээр syncParcel хийнэ.
  //
  // timeout: 0 — backend нь дундын сервисийг 100-гийн БАГЦААР, багц хооронд
  // зайтай дууддаг тул том чөлөөлөлт дээр 30 сек-ийн хязгаарт багтахгүй.
  // Явцыг татах цонх өөрөө харуулах ба цуцлах товч байдаг.
  discoverParcels: (acqId: string, opts?: { silent?: boolean }) =>
    api.post<ApiResponse<ParcelDiscoveryResult>>(`/land-acquisitions/${acqId}/parcels/by-acquisition`, undefined, { _silent: opts?.silent, timeout: 0 }).then(r => r.data.data),
  syncParcel: (acqId: string, parcelId: string, opts?: { silent?: boolean }) =>
    api.post(`/land-acquisitions/${acqId}/parcels/${parcelId}/sync`, undefined, { _silent: opts?.silent }),
  syncValuation: (acqId: string, parcelId: string, opts?: { silent?: boolean }) =>
    api.post(`/land-acquisitions/${acqId}/parcels/${parcelId}/sync/valuation`, undefined,
      { _silent: opts?.silent }).then(r => r.data),
  // Нэгж талбарын ХАВСРАЛТ татах. parcelCode нь UUID биш, нэгж талбарын КОД.
  // roles — баримтын үүргийн код (хоосон бол бүх хавсралт).
  // Зөвхөн нэмэх үйлдэл тул дахин дарахад аюулгүй.
  // Эзэмшигч (иргэн, хуулийн этгээд) — /sync-ээс ТУСАД НЬ татагдана.
  // app_no нь /sync-ээр хадгалагддаг тул түүнийг эхлээд ажиллуулсан байх ёстой (эс бөгөөс 422).
  syncParcelHolders: (acqId: string, parcelCode: string, opts?: { silent?: boolean }) =>
    api.post<ApiResponse<ParcelHolderSyncResult>>(
      `/land-acquisitions/${acqId}/parcels/${parcelCode}/sync/holders`,
      undefined,
      { _silent: opts?.silent },
    ).then(r => r.data.data),
  // Газрын төлбөр үнэлгээний бүлэг — ГУС-ийн жинхэнэ дуудалтууд
  syncParcelBasePrice: (acqId: string, parcelCode: string, opts?: { silent?: boolean }) =>
    api.post<ApiResponse<ParcelBasePrice>>(
      `/land-acquisitions/${acqId}/parcels/${parcelCode}/sync/base-price`,
      undefined, { _silent: opts?.silent },
    ).then(r => r.data.data),
  // Өмчлөлийн (right_type=3) газарт 422 + анхааруулга буцна
  syncParcelInvoices: (acqId: string, parcelCode: string, opts?: { silent?: boolean }) =>
    api.post<ApiResponse<ParcelInvoiceSyncResult>>(
      `/land-acquisitions/${acqId}/parcels/${parcelCode}/sync/invoices`,
      undefined, { _silent: opts?.silent },
    ).then(r => r.data.data),
  // Газрын төлбөрийн БОДОЛТ (бүсээр). Өмчлөлийн газарт 422 буцна.
  syncParcelFee: (acqId: string, parcelCode: string, opts?: { silent?: boolean }) =>
    api.post<ApiResponse<ParcelFeeSyncResult>>(
      `/land-acquisitions/${acqId}/parcels/${parcelCode}/sync/fee`,
      undefined, { _silent: opts?.silent },
    ).then(r => r.data.data),
  syncParcelMortgages: (acqId: string, parcelCode: string, opts?: { silent?: boolean }) =>
    api.post<ApiResponse<ParcelSyncCountResult>>(
      `/land-acquisitions/${acqId}/parcels/${parcelCode}/sync/mortgages`,
      undefined, { _silent: opts?.silent },
    ).then(r => r.data.data),
  syncParcelCourtDecisions: (acqId: string, parcelCode: string, opts?: { silent?: boolean }) =>
    api.post<ApiResponse<ParcelSyncCountResult>>(
      `/land-acquisitions/${acqId}/parcels/${parcelCode}/sync/court-decisions`,
      undefined, { _silent: opts?.silent },
    ).then(r => r.data.data),
  syncParcelMonitorings: (acqId: string, parcelCode: string, opts?: { silent?: boolean }) =>
    api.post<ApiResponse<ParcelSyncCountResult>>(
      `/land-acquisitions/${acqId}/parcels/${parcelCode}/sync/monitoring`,
      undefined, { _silent: opts?.silent },
    ).then(r => r.data.data),
  // УБЕГ-ийн газар өмчлөлийн бүртгэл — ГУС-аас БИШ, ХУР (XYP) гарцаас.
  // app_no шаардахгүй (нэгж талбарын дугаараар шууд) тул татах дарааллаас
  // хамаарахгүй. Бүртгэл байхгүй үед found=0.
  syncParcelOwnerships: (acqId: string, parcelCode: string, opts?: { silent?: boolean }) =>
    api.post<ApiResponse<ParcelSyncCountResult>>(
      `/land-acquisitions/${acqId}/parcels/${parcelCode}/sync/ownership`,
      undefined, { _silent: opts?.silent },
    ).then(r => r.data.data),
  syncParcelDocuments: (acqId: string, parcelCode: string, roles?: string[], opts?: { silent?: boolean }) =>
    api.post<ApiResponse<ParcelDocumentSyncResult>>(
      `/land-acquisitions/${acqId}/parcels/${parcelCode}/sync/documents`,
      undefined,
      {
        // Backend ?role=10,20 хэлбэрийг задалдаг — axios-ийн массив хэлбэр
        // (role[]=10) биш тул таслалаар нэгтгэнэ.
        ...(roles?.length ? { params: { role: roles.join(',') } } : {}),
        _silent: opts?.silent,
      },
    ).then(r => r.data.data),
  updateParcelValuation: (acqId: string, parcelId: string, body: { valuation_zone: string; base_price_per_ha?: number | null; auction_coeff?: number | null; auction_price?: number | null }) =>
    api.patch(`/land-acquisitions/${acqId}/parcels/${parcelId}/valuation`, body),
  getProgress: (id: string) =>
    api.get<ApiResponse<AcquisitionProgress[]>>(`/land-acquisitions/${id}/progress`).then(r => r.data.data),
  getBoundaryHistory: (id: string) =>
    api.get<ApiResponse<BoundaryHistory[]>>(`/land-acquisitions/${id}/boundary-history`).then(r => r.data.data ?? []),
  getAvailableStatuses: (id: string) =>
    api.get<ApiResponse<StatusOption[]>>(`/land-acquisitions/${id}/available-statuses`).then(r => r.data.data ?? []),
  advanceStatus: (id: string, toStatus: number, note?: string, decreeNumber?: string, decreeDate?: string) =>
    api.post<ApiResponse<LandAcquisition>>(`/land-acquisitions/${id}/advance`, {
      to_status: toStatus,
      note: note ?? '',
      decree_number: decreeNumber ?? '',
      decree_date: decreeDate ?? null,
    }).then(r => r.data.data),
  updateParcelMeta: (acqId: string, parcelId: string, dbChanged: string, changedParcelId: string, acquisitionAreaM2?: number, acquisitionGeomWkt?: string) =>
    api.patch(`/land-acquisitions/${acqId}/parcels/${parcelId}/meta`, {
      db_changed: dbChanged,
      changed_parcel_id: changedParcelId,
      ...(acquisitionAreaM2 != null ? { acquisition_area_m2: acquisitionAreaM2 } : {}),
      ...(acquisitionGeomWkt ? { acquisition_geom_wkt: acquisitionGeomWkt } : {}),
    }).then(r => r.data),
  listDocuments: (id: string) =>
    api.get<ApiResponse<Document[]>>(`/land-acquisitions/${id}/documents`).then(r => r.data.data ?? []),
  uploadDocument: (id: string, file: File, documentTypeId?: number, name?: string) => {
    const fd = new FormData()
    fd.append('file', file)
    if (documentTypeId) fd.append('document_type_id', String(documentTypeId))
    if (name?.trim()) fd.append('name', name.trim())
    return api.post<ApiResponse<Document>>(`/land-acquisitions/${id}/documents`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data)
  },
  deleteDocument: (id: string, docId: string) =>
    api.delete(`/land-acquisitions/${id}/documents/${docId}`),
  // Нийгэм, эдийн засгийн судалгаа — чөлөөлөлтөд НЭГ бүртгэл.
  // Бүртгэл ороогүй үед data=null ирдэг тул null-ийг хүлээж авна.
  getSocioSurvey: (id: string) =>
    api.get<ApiResponse<AcquisitionSocioSurvey | null>>(`/land-acquisitions/${id}/socio-survey`)
      .then(r => r.data.data ?? null),
  // Судалгааны файл нь ЗӨВХӨН PDF. Хэрэглэгч олон файл сонговол дэлгэц дээр
  // НЭГ PDF болж нэгтгэгдээд ирнэ — сервер рүү үргэлж нэг файл явна.
  // Хадгалагдсан бүртгэл дээр file-гүй илгээвэл өмнөх файл хэвээр үлдэнэ.
  saveSocioSurvey: (
    id: string,
    body: { agreed_count: number; rejected_count: number; note?: string; file?: File | null },
  ) => {
    const fd = new FormData()
    fd.append('agreed_count', String(body.agreed_count))
    fd.append('rejected_count', String(body.rejected_count))
    fd.append('note', body.note ?? '')
    if (body.file) fd.append('file', body.file)
    return api.post<ApiResponse<AcquisitionSocioSurvey>>(`/land-acquisitions/${id}/socio-survey`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data)
  },

  // ── Дроны ортофото (.tif) ──────────────────────────────────────────────
  // Нэг хүсэлтэд НЭГ файл — олон зургийг дараалан байршуулна.
  //
  // Файл BACKEND-ЭЭР ДАМЖИХГҮЙ. Гурван алхам:
  //   1. createDroneUploadUrl  — backend-ээс байршуулах зөвшөөрөл (presigned URL)
  //   2. putDroneFileDirect    — browser файлыг ШУУД файлын систем руу PUT
  //   3. registerDroneImage    — backend объектыг шалгаж чөлөөлөлтөд холбоно
  // Ингэснээр хэдэн GB ортофото ч API-ийн санах ой, хугацаа, хүсэлтийн
  // хэмжээний хязгаараас хамаарахгүй — хэмжээний хязгаар байхгүй.
  listDroneImages: (acqId: string) =>
    api.get<ApiResponse<DroneImage[]>>(`/land-acquisitions/${acqId}/drone-images`)
      .then(r => r.data.data ?? []),
  createDroneUploadUrl: (acqId: string, fileName: string) =>
    api.post<ApiResponse<DroneUploadTicket>>(
      `/land-acquisitions/${acqId}/drone-images/upload-url`,
      { file_name: fileName },
    ).then(r => r.data.data),
  // Файлыг ӨӨРИЙН origin-ий `/api/files/...` руу тавина. Next-ийн route нь
  // биеийг урсгалаар MinIO руу дамжуулна.
  //
  // ЯАГААД MinIO-руу ШУУД БИШ: presigned URL-ийн host нь backend-ийн хаяг
  // (container-т `minio:9000`) — browser түүнийг шийдэж чаддаггүй. Мөн шууд
  // хандвал MinIO-ийн порт гадаад сүлжээнд нээлттэй байх, CORS ажиллах
  // шаардлагатай болдог. Өөрийн origin-руу тавихад тэр гурав нь бүгд арилна.
  //
  // Зөвшөөрөл нь presigned URL-ийн query (X-Amz-*) дотор — түүнийг хэвээр
  // дамжуулж, MinIO өөрөө шалгана. `api` instance-ыг хэрэглэхгүй: Authorization
  // header нь гарын үсэгтэй зөрчилдөж, interceptor нь файлын серверийн хариуд
  // хөндлөнгөөс оролцох ёсгүй.
  putDroneFileDirect: (
    ticket: DroneUploadTicket,
    file: File,
    onProgress?: (percent: number) => void,
  ) =>
    axios.put(ticket.file_url + '?' + new URL(ticket.url).search.replace(/^\?/, ''), file, {
      headers: { 'Content-Type': 'image/tiff' },
      timeout: 0,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      onUploadProgress: (e) => {
        if (!onProgress || !e.total) return
        onProgress(Math.round((e.loaded / e.total) * 100))
      },
    }).then(() => undefined),
  // timeout: 0 — бүртгэл нь GeoServer-т давхарга нийтлэхийг ДОТРОО хийдэг тул
  // ердийн 30 сек-ийн хязгаарт багтахгүй байж болно. GeoServer растрын толгойг
  // (IFD) HTTP Range-ээр уншина: жинхэнэ COG дээр 1-2 сек, харин COG БИШ
  // GeoTIFF-ийн толгой файлын төгсгөлд байдаг тул файлыг эхнээс дуустал мөлхөж
  // уншиж, хэмжээнээсээ хамаарч минут хүрч болно.
  //
  // 30 сек-ийн хязгаар нь ЯГ ЭНЭ ШАЛТГААНААР 138 MB, COG биш ортофотог
  // оруулахад алдаа гаргаж байсан: browser 30 сек-т таслахад backend-ийн
  // context цуцлагдаж нийтлэлт хагасаас тасарч, хэрэглэгчид "сервер алдаа"
  // харагдаж байв (харин 190 MB-ийн COG нь 1 сек-т нийтлэгдэж хэвийн ордог —
  // ХЭМЖЭЭ биш, ФАЙЛЫН БҮТЭЦ шалтгаан болж байсан).
  registerDroneImage: (acqId: string, storedName: string, originalName: string) =>
    api.post<ApiResponse<DroneImage>>(`/land-acquisitions/${acqId}/drone-images`, {
      stored_name: storedName,
      original_name: originalName,
    }, { timeout: 0 }).then(r => r.data.data),
  // Зураг байршуулсны ДАРАА автоматаар дуудна — GeoServer-ийн мозайкийг
  // шинэчилж (harvest + reset) шинэ зургийг давхаргад харагдахаар болгоно.
  //
  // _silent: true — GeoServer унасан/тохиргоо эвдэрсэн үед 500 буцаж болно.
  // Тэр үед хэрэглэгчийг /server-error хуудас руу ШИДЭХГҮЙ: зураг аль хэдийн
  // файлын системд хадгалагдсан, зөвхөн давхаргад бүртгэгдээгүй байна. Дуудагч
  // алдааг барьж анхааруулга харуулж, "GeoServer шинэчлэх" товчоор дахин
  // оролдох боломж үлдэнэ.
  refreshDroneImages: (acqId: string) =>
    api.post<ApiResponse<DroneImage[]>>(`/land-acquisitions/${acqId}/drone-images/refresh`, undefined, {
      timeout: 0,
      _silent: true,
    }).then(r => r.data.data ?? []),
  deleteDroneImage: (acqId: string, imageId: string) =>
    api.delete(`/land-acquisitions/${acqId}/drone-images/${imageId}`),

  // Backend `user_id`/`assigned_by`-г ТОО болгож буцаадаг (sdplatform int4),
  // харин бичихдээ МӨР хүлээж авдаг. Уншихдаа мөр болгож жигдрүүлэхгүй бол
  // хэрэглэгчийн жагсаалттай тулгах (`assignedIds.has(u.id)`) ажиллахгүй.
  getAssignees: (acquisitionId: string): Promise<AcquisitionAssignee[]> =>
    api.get<ApiResponse<AcquisitionAssignee[]>>(`/land-acquisitions/${acquisitionId}/assignees`)
      .then(r => (r.data.data ?? []).map((a: any) => ({
        ...a,
        user_id: String(a.user_id ?? ''),
        assigned_by: a.assigned_by == null ? '' : String(a.assigned_by),
      }))),

  setAssignees: (acquisitionId: string, users: { user_id: string; user_name: string; user_position?: string }[]): Promise<AcquisitionAssignee[]> =>
    api.put<ApiResponse<AcquisitionAssignee[]>>(`/land-acquisitions/${acquisitionId}/assignees`, { users })
      .then(r => r.data.data ?? []),

  // Чөлөөлөлтийн үндсэн үнэлгээний БАЙГУУЛЛАГЫГ оноох (хэрэглэгч биш).
  setProfessionalOrg: (acquisitionId: string, orgId: string | null) =>
    api.put(`/land-acquisitions/${acquisitionId}/professional-org`, { org_id: orgId }),

  // Нэгж талбарын хараат бус үнэлгээний БАЙГУУЛЛАГЫГ оноох.
  setParcelIndependentOrg: (acqId: string, parcelId: string, orgId: string | null) =>
    api.patch(
      `/land-acquisitions/${acqId}/parcels/${parcelId}/independent-org`,
      { org_id: orgId }
    ),

  // Funding sources — жагсаалт нь getById-ийн funding_sources талбараар ирдэг (тусдаа GET байхгүй)
  createFundingSource: (acqId: string, body: Omit<FundingSource, 'id' | 'acquisition_id' | 'created_at' | 'created_by'>) =>
    api.post<ApiResponse<FundingSource>>(`/land-acquisitions/${acqId}/funding-sources`, body).then(r => r.data.data),
  updateFundingSource: (acqId: string, srcId: string, body: Partial<Omit<FundingSource, 'id' | 'acquisition_id' | 'created_at' | 'created_by'>>) =>
    api.put<ApiResponse<FundingSource>>(`/land-acquisitions/${acqId}/funding-sources/${srcId}`, body).then(r => r.data.data),
  deleteFundingSource: (acqId: string, srcId: string) =>
    api.delete(`/land-acquisitions/${acqId}/funding-sources/${srcId}`),

  // WKT хилээс талбай (м²) тооцно.
  //
  // ЯАГААД СЕРВЕРЭЭР: талбайг ГУС-тай ИЖИЛ аргаар — UTM проекц дээр, бүхэл
  // м² болгож бөөрөнхийлж — бодох ёстой (ГУС: base.calculate_area_utm).
  // Browser дээр бөмбөрцгийн ойролцоо томьёогоор тооцвол нэгж талбар татахад
  // бодогдсон тооноос өргөрөг/уртрагаас хамаарч 0.03-0.12% зөрдөг байв.
  computeGeometryArea: (geomWKT: string) =>
    api.post<ApiResponse<{ area_m2: number }>>(`/geometry/area`, { geom_wkt: geomWKT })
      .then(r => r.data.data?.area_m2 ?? null),

  // AuthorizedRepresentative
  // Итгэмжлэгдсэн төлөөлөгч нь эзэмшигчийн НЭГ ТӨРӨЛ болж parcel_holder-т
  // хадгалагдана — тиймээс ParcelHolder буцаана (holder_role='representative').
  listRepresentatives: (acqId: string, parcelId: string) =>
    api.get<ApiResponse<ParcelHolder[]>>(`/land-acquisitions/${acqId}/parcels/${parcelId}/representatives`).then(r => r.data.data ?? []),
  createRepresentative: (acqId: string, parcelId: string, body: RepresentativeInput) =>
    api.post<ApiResponse<ParcelHolder>>(`/land-acquisitions/${acqId}/parcels/${parcelId}/representatives`, body).then(r => r.data.data),
  // Нөхөн төлбөр хүлээн авах эзэмшигчийг сонгох (holderId = parcel_holder мөрийн id)
  setPaymentRecipient: (acqId: string, parcelId: string, holderId: string) =>
    api.put(`/land-acquisitions/${acqId}/parcels/${parcelId}/payment-recipient`, { holder_id: holderId }),
  deleteRepresentative: (acqId: string, parcelId: string, repId: string) =>
    api.delete(`/land-acquisitions/${acqId}/parcels/${parcelId}/representatives/${repId}`),

  // Үнэлгээний байгууллагын сонгогчид (чөлөөлөлтийн үндсэн гүйцэтгэгч, нэгж
  // талбарын хараат бус үнэлгээчин) тэжээх жагсаалт.
  //
  // Өмнө нь `professional_org` рольтой ХЭРЭГЛЭГЧДИЙГ жагсаадаг байсан — тэр үед
  // байгууллага = нэг хэрэглэгч байв. Одоо байгууллага бие даасан бүртгэлтэй
  // бөгөөд олон ажилтантай тул байгууллагын лавлахаас уншина.
  listValuationOrgs: () =>
    valuationOrgApi.list({ is_active: true, page_size: 200 }).then(r => r.data ?? []),
}

// ── Global Parcels ────────────────────────────────────
/** «Нөхөх олговор олгосон баримт»-ын олголтын шат ба огноо. */
export interface DocumentPaymentInput {
  stage: "60" | "40" | "full";
  /** YYYY-MM-DD */
  date: string;
}

export function appendDocumentPayment(fd: FormData, payment?: DocumentPaymentInput) {
  if (!payment) return
  fd.append('payment_stage', payment.stage)
  if (payment.date) fd.append('payment_date', payment.date)
}

export const parcelApi = {
  list: async (params?: ParcelListParams) => {
    const q = parcelListSearchParams(params)
    const suffix = q.toString()

    try {
      // _allow404 — 404 үед доор чөлөөлөлт тус бүрээр нь эвлүүлдэг тул
      // хэрэглэгчид "Мэдээлэл олдсонгүй" гэж харуулах шаардлагагүй.
      return await api
        .get<PaginatedResponse<GlobalParcel>>(`/parcels${suffix ? `?${suffix}` : ''}`, { _allow404: true })
        .then(r => r.data)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404 && !params?.years?.length) {
        return listParcelsFromAcquisitions(params)
      }
      throw error
    }
  },
  listPayments: (id: string) =>
    api.get<ApiResponse<ParcelPayment[]>>(`/parcels/${id}/payments`).then(r => r.data.data ?? []),
  addPayment: (id: string, body: { amount: number; currency: string; paid_at?: string; note?: string }) =>
    api.post(`/parcels/${id}/payments`, body).then(r => r.data),
  listDocuments: (id: string) =>
    api.get<ApiResponse<Document[]>>(`/parcels/${id}/documents`).then(r => r.data.data ?? []),
  // payment — «Нөхөх олговор олгосон баримт»: шат (60 | 40 | full) ба олгосон огноо (YYYY-MM-DD).
  uploadDocument: (id: string, file: File, documentTypeId?: number, name?: string, payment?: DocumentPaymentInput) => {
    const fd = new FormData()
    fd.append('file', file)
    if (documentTypeId) fd.append('document_type_id', String(documentTypeId))
    if (name?.trim()) fd.append('name', name.trim())
    appendDocumentPayment(fd, payment)
    return api.post<ApiResponse<Document>>(`/parcels/${id}/documents`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data)
  },
  deleteDocument: (id: string, docId: string) =>
    api.delete(`/parcels/${id}/documents/${docId}`),
  // Урьдчилан мэдэгдэх хуудсыг имэйлээр илгээх ба илгээсэн түүх.
  // PDF-ийг /api/templates/medegdeh-huudas/pdf үүсгэж, файлаар нь илгээнэ.
  listNoticeEmails: (id: string) =>
    api.get<ApiResponse<ParcelNoticeEmail[]>>(`/parcels/${id}/notice-emails`).then(r => r.data.data ?? []),
  sendNoticeEmail: (id: string, to: string, file: File) => {
    const fd = new FormData()
    fd.append('to', to)
    fd.append('file', file)
    return api.post<ApiResponse<ParcelNoticeEmail>>(`/parcels/${id}/notice-emails`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data)
  },
  // E-Mongolia-гаар мэдэгдэл хүргүүлэх ба илгээсэн түүх (2.8.5).
  // Гадаад холболт одоогоор МОК — хариултын status="mocked" ирнэ.
  listEMongoliaNotices: (id: string) =>
    api.get<ApiResponse<ParcelEMongoliaNotice[]>>(`/parcels/${id}/emongolia-notices`).then(r => r.data.data ?? []),
  sendEMongoliaNotice: (id: string, registerNo: string, recipientName: string, file: File) => {
    const fd = new FormData()
    fd.append('register_no', registerNo)
    fd.append('recipient_name', recipientName)
    fd.append('file', file)
    return api.post<ApiResponse<ParcelEMongoliaNotice>>(`/parcels/${id}/emongolia-notices`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data)
  },
  getAvailableStatuses: (acqId: string, parcelId: string) =>
    api.get<ApiResponse<ParcelStatus[]>>(`/land-acquisitions/${acqId}/parcels/${parcelId}/available-statuses`)
      .then(r => r.data.data ?? []),
  // reason — төлөв солих ШАЛТГААН. "Нөлөөлөгдсөн гарсан"/"Татгалзсан" үед
  // backend ЗААВАЛ шаардана (хоосон бол 400); бусад төлөвт хоосон байж болно.
  // file — "Татгалзсан" төлөвт ЗААВАЛ (backend 422 буцаана), бусад төлөвт
  // заавал биш. Файлтай үед multipart-аар явна: файл нь нэгж талбарын БАРИМТ
  // болж бүртгэгдээд явцын түүхэнд холбоосоороо гарна.
  // fileName — хавсралтын ХАРАГДАХ нэр (хэрэглэгч засна). Хоосон бол backend
  // файлын нэрийг хэрэглэнэ.
  // documentTypeId — хавсралтын төрөл: явцад заавал хавсралт тохируулсан бол
  // тэр төрлөөр бүртгэгдэж шаардлагыг хангана.
  updateStatus: (acqId: string, parcelId: string, statusId: number, reason?: string, file?: File | null, fileName?: string, documentTypeId?: number) => {
    const url = `/land-acquisitions/${acqId}/parcels/${parcelId}/status`
    if (file) {
      const fd = new FormData()
      fd.append('status_id', String(statusId))
      fd.append('reason', reason ?? "")
      fd.append('file', file)
      if (fileName?.trim()) fd.append('file_name', fileName.trim())
      if (documentTypeId) fd.append('document_type_id', String(documentTypeId))
      return api.patch(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    }
    return api.patch(url, { status_id: statusId, reason: reason ?? "" })
  },
  listStatusHistory: (acqId: string, parcelId: string) =>
    api.get<ApiResponse<ParcelStatusHistory[]>>(`/land-acquisitions/${acqId}/parcels/${parcelId}/status-history`)
      .then(r => r.data.data ?? []),
  /** statusId руу шилжихэд шаардлагатай хавсралт бүр нэгж талбарт орсон эсэх. */
  getStatusRequirements: (acqId: string, parcelId: string, statusId: number) =>
    api.get<ApiResponse<ParcelStatusRequirement[]>>(`/land-acquisitions/${acqId}/parcels/${parcelId}/status-requirements`, { params: { status_id: statusId } })
      .then(r => r.data.data ?? []),
}

// ── Системийн тохиргоо (газрын зургийн суурь зураг) ───
//
// Уншилтыг нэвтэрсэн бүх хэрэглэгч хийнэ (газрын зураг ижил суурь зурагтай
// байх ёстой), СОЛИХ нь admin:update эрхтэйд (backend хаалгална).
// Чөлөөлөгдсөн газрын судалгаа — нэгж талбарт НЭГ бүртгэл (parcel.id-гаар).
export const parcelSurveyApi = {
  get: (parcelUuid: string) =>
    api.get<ApiResponse<ParcelSurvey | null>>(`/parcels/${parcelUuid}/survey`).then(r => r.data.data ?? null),
  save: (parcelUuid: string, body: ParcelSurveyInput) =>
    api.put<ApiResponse<ParcelSurvey>>(`/parcels/${parcelUuid}/survey`, body).then(r => r.data.data),
  // Хариултыг хоосолно — бүртгэл нэгж талбартайгаа үлдэнэ.
  clear: (parcelUuid: string) =>
    api.delete(`/parcels/${parcelUuid}/survey`),
  list: (params?: { page?: number; page_size?: number; acquisition_id?: string; parcel_id?: string; answered?: boolean; sort?: string; order?: 'asc' | 'desc' }) =>
    api.get<PaginatedResponse<ParcelSurveyRow>>('/parcel-surveys', { params }).then(r => r.data),
  // acquisition_ids — давтан `acquisition_id` болж очно (хоосон бол бүх нэгж талбар).
  summary: (params?: { acquisition_ids?: string[]; parcel_id?: string }, opts?: { silent?: boolean }) => {
    const q = new URLSearchParams()
    params?.acquisition_ids?.forEach(id => q.append('acquisition_id', id))
    if (params?.parcel_id) q.set('parcel_id', params.parcel_id)
    const suffix = q.toString()
    return api
      .get<ApiResponse<ParcelSurveySummary>>(`/parcel-surveys/summary${suffix ? `?${suffix}` : ''}`, { _silent: opts?.silent })
      .then(r => r.data.data)
  },
}

export const settingsApi = {
  // Тохируулаагүй үед data=null ирнэ — дэлгэц өгөгдмөл суурь зургаа хэрэглэнэ.
  getBasemap: () =>
    api.get<ApiResponse<BasemapSetting | null>>('/settings/basemap', { _allow404: true })
      .then(r => r.data.data ?? null)
      .catch(() => null),
  saveBasemap: (body: BasemapSetting) =>
    api.put<ApiResponse<BasemapSetting>>('/settings/basemap', body).then(r => r.data.data),
  resetBasemap: () => api.delete('/settings/basemap').then(r => r.data),
}

// ── Parcel Workflow ───────────────────────────────────
export const parcelWorkflowApi = {
  list: () =>
    api.get<ApiResponse<ParcelWorkflow[]>>('/parcel-workflow').then(r => r.data.data ?? []),
  // document_type_ids — энэ шилжилтэд ЗААВАЛ байх хавсралт (заавал биш).
  create: (body: { from_status_id: number | null; to_status_id: number; sort_order?: number; document_type_ids?: number[] }) =>
    api.post<{ code: number; data: ParcelWorkflow }>('/parcel-workflow', body).then(r => r.data.data),
  delete: (id: number) => api.delete(`/parcel-workflow/${id}`),
  /** Шилжилтийн заавал хавсралтыг БҮХЭЛД нь солино (хоосон = шаардлагагүй). */
  setRequiredDocuments: (workflowId: number, documentTypeIds: number[]) =>
    api.put(`/parcel-workflow/${workflowId}/required-documents`, { document_type_ids: documentTypeIds }),
}

// ── Report rows ───────────────────────────────────────
function reportQueryString(params?: ReportListParams): string {
  const q = new URLSearchParams()
  if (params?.page) q.set('page', String(params.page))
  if (params?.page_size) q.set('page_size', String(params.page_size))
  if (params?.acquisition_id) q.set('acquisition_id', params.acquisition_id)
  if (params?.acquisition_name) q.set('acquisition_name', params.acquisition_name)
  if (params?.plan_code) q.set('plan_code', params.plan_code)
  if (params?.au3_code) q.set('au3_code', params.au3_code)
  if (params?.right_type) q.set('right_type', String(params.right_type))
  if (params?.landuse) q.set('landuse', params.landuse)
  params?.years?.forEach(year => q.append('year', String(year)))
  if (params?.compensation_type) q.set('compensation_type', params.compensation_type)
  if (params?.general_category_id) q.set('general_category_id', String(params.general_category_id))
  if (params?.sub_category_id) q.set('sub_category_id', String(params.sub_category_id))
  if (params?.sort) q.set('sort', params.sort)
  if (params?.order) q.set('order', params.order)
  return q.toString()
}

export const reportApi = {
  list: (params?: ReportListParams) => {
    const suffix = reportQueryString(params)
    return api.get<PaginatedResponse<ReportParcelRow>>(`/report/download${suffix ? `?${suffix}` : ''}`).then(r => r.data)
  },
  // Жагсаалтын дээд хэсгийн статистикийн картуудад зориулсан нэгтгэсэн тоо/дүн —
  // бүх хуудсыг client талд дараалан татахын оронд НЭГ л дуудлагаар авна.
  summary: (params?: Omit<ReportListParams, 'page' | 'page_size'>) => {
    const suffix = reportQueryString(params)
    return api.get<ApiResponse<ReportSummary>>(`/report/summary${suffix ? `?${suffix}` : ''}`).then(r => r.data.data)
  },
}

// ── Plans ─────────────────────────────────────────────
export const planApi = {
  // withBoundary — хилийн геометрийг (boundary_wkt) хамт татна. Хил нь ХЭДЭН
  // ЗУУН КБ болж мэддэг тул зөвхөн зураг дээр зурах шаардлагатай үед л
  // хүснэ (чөлөөлөлт үүсгэх / хил солих дэлгэц).
  search: (code: string, opts?: { withBoundary?: boolean }) =>
    api.get<ApiResponse<Plan>>('/plans/search', {
      params: { code, ...(opts?.withBoundary ? { with_boundary: 1 } : {}) },
    }).then(r => r.data.data),
  suggest: (q: string) =>
    api.get<ApiResponse<Plan[]>>('/plans/suggest', { params: { q } }).then(r => r.data.data ?? []),
}

// ── Asset Spec Types (admin) ──────────────────────────
export const assetSpecTypeApi = {
  list: () =>
    api.get<ApiResponse<AssetSpecType[]>>('/asset-spec-types').then(r => r.data.data ?? []),
  create: (body: { code: string; name: string; sort_order: number }) =>
    api.post<AssetSpecType>('/asset-spec-types', body).then(r => r.data),
  update: (id: number, body: { code: string; name: string; sort_order: number }) =>
    api.put<ApiResponse<AssetSpecType>>(`/asset-spec-types/${id}`, body).then(r => r.data.data),
  delete: (id: number) =>
    api.delete(`/asset-spec-types/${id}`),
}

// ── Asset Calc Types (admin) ──────────────────────────
export const assetCalcTypeApi = {
  list: () =>
    api.get<ApiResponse<AssetCalcType[]>>('/asset-calc-types').then(r => r.data.data ?? []),
  create: (body: { code: string; name: string; default_unit: string; sort_order: number }) =>
    api.post<AssetCalcType>('/asset-calc-types', body).then(r => r.data),
  update: (id: number, body: { code: string; name: string; default_unit: string; sort_order: number }) =>
    api.put<ApiResponse<AssetCalcType>>(`/asset-calc-types/${id}`, body).then(r => r.data.data),
  delete: (id: number) =>
    api.delete(`/asset-calc-types/${id}`),
}

// ── Dashboard (aggregated) ────────────────────────────
export interface ParcelStatusStat {
  status_id: number
  name:      string
  count:     number
  area_m2:   number
}

export interface TimelinePoint {
  date:  string
  count: number
}

export interface ValuationStatusStat {
  status: string
  count:  number
}

export interface ValuationTypeStat {
  valuation_type: string
  count:          number
  amount:         number
}

export interface DashboardDecisions {
  total:      number
  confirmed:  number  // Баталгаажсан
  confirming: number  // Баталгаажуулах
  reviewing:  number  // Хянагдаж буй
  draft:      number  // Төсөл
}

export interface DashboardCompensation {
  total:      number
  /** Захирамж гарсан (Баталгаажсан / Баталгаажуулах) нэгж талбар. */
  issued:     number
  /** Захирамжгүй, үнэлгээ баталгаажсан. */
  approved:   number
  /** Захирамжгүй, үнэлгээ баталгаажаагүй. */
  unapproved: number
}

export interface DashboardData {
  acquisitions:         LandAcquisition[]
  parcel_statuses:      ParcelStatus[]
  total_parcels:        number
  freed_parcels:        number
  freed_area_m2:        number
  plan_area_m2:         number
  /** Баталгаажсан захирамжийн тоо (decisions.confirmed). */
  total_orders:         number
  total_compensation:   number
  /** Dashboard-ын чөлөөлөлтүүдээр хайсан захирамжийн төсөл — явцаар. */
  decisions?:           DashboardDecisions
  /** Нөхөх олговрын задаргаа. */
  compensation?:        DashboardCompensation
  status_breakdown:     ParcelStatusStat[]
  timeline:             TimelinePoint[]
  valuation_statuses?:  ValuationStatusStat[]
  valuation_types?:     ValuationTypeStat[]
  filtered_parcel_ids:  string[]
  filtered_au1_codes:   string[]
  filtered_au2_codes:   string[]
  filtered_au3_codes:   string[]
  /** Шүүгдсэн чөлөөлөлтүүдийн байршил — дүүрэг ба хороодын НЭР. */
  locations?:           { district: string; khoroos: string[] }[]
}

export type DashboardFilter = {
  acquisition_id?:      string
  plan_code?:           string
  status?:              number
  years?:               number[]
  general_category_id?: number
  sub_category_id?:     number
  assigned_user_id?:    string
  au2_code?:            string
}

export const dashboardApi = {
  // silent — газрын зургийн самбар г.м. арын хүсэлт: loader/алдааны toast-гүй.
  get: (filter?: DashboardFilter, opts?: { silent?: boolean }): Promise<DashboardData> => {
    const params = new URLSearchParams()
    if (filter?.acquisition_id)      params.set('acquisition_id', filter.acquisition_id)
    if (filter?.plan_code)           params.set('plan_code', filter.plan_code)
    if (filter?.status)              params.set('status', String(filter.status))
    if (filter?.general_category_id) params.set('general_category_id', String(filter.general_category_id))
    if (filter?.sub_category_id)     params.set('sub_category_id', String(filter.sub_category_id))
    if (filter?.assigned_user_id)    params.set('assigned_user_id', filter.assigned_user_id)
    if (filter?.au2_code)            params.set('au2_code', filter.au2_code)
    filter?.years?.forEach(y => params.append('year', String(y)))
    return api.get<ApiResponse<DashboardData>>(`/dashboard?${params}`, { _silent: opts?.silent }).then(r => r.data.data)
  },
  /**
   * «Он цагийн зураг» — цаг хугацааны изометр зургийн өгөгдөл (нэгж талбарын геометр 3857,
   * чөлөөлсөн огноо, түүх, сараар чөлөөлсөн тоо). acquisitionIds хоосон = бүх чөлөөлөлт.
   */
  chronos: (acquisitionIds?: string[]): Promise<import('@/lib/chronos').ChronosData> => {
    const params = new URLSearchParams()
    acquisitionIds?.forEach(id => params.append('acquisition_id', id))
    const suffix = params.toString()
    return api
      // Он цагийн зураг өөрийн loader-тэй — бүтэн дэлгэцийн блоклогч loader асаахгүй.
      .get<ApiResponse<import('@/lib/chronos').ChronosData>>(`/dashboard/chronos${suffix ? `?${suffix}` : ''}`, { _silent: true })
      .then(r => r.data.data)
  },
  // САНХҮҮГИЙН самбар — зөвхөн мөнгөн дүн/тоо (он, дүүрэг, хороогоор).
  // Backend нь НЭГ асуулгаар нэгтгэдэг тул жагсаалт татах шаардлагагүй.
  finance: (filter?: FinanceDashboardFilter, opts?: { silent?: boolean }): Promise<FinanceDashboardData> => {
    const params = new URLSearchParams()
    if (filter?.au2_code) params.set('au2_code', filter.au2_code)
    if (filter?.au3_code) params.set('au3_code', filter.au3_code)
    if (filter?.acquisition_id) params.set('acquisition_id', filter.acquisition_id)
    filter?.years?.forEach(y => params.append('year', String(y)))
    const suffix = params.toString()
    return api
      .get<ApiResponse<FinanceDashboardData>>(`/dashboard/finance${suffix ? `?${suffix}` : ''}`, { _silent: opts?.silent })
      .then(r => r.data.data)
  },
}

// ── Document Types ────────────────────────────────────
export const documentTypeApi = {
  list: (target?: 'acquisition' | 'parcel' | '') =>
    api.get<ApiResponse<DocumentType[]>>('/document-types', { params: target ? { target } : undefined }).then(r => r.data.data ?? []),
  create: (body: { type: string; name: string; target?: string; description?: string }) =>
    api.post<ApiResponse<DocumentType>>('/document-types', body).then(r => r.data.data),
  update: (id: number, body: { type?: string; name?: string; target?: string; description?: string }) =>
    api.put<ApiResponse<DocumentType>>(`/document-types/${id}`, body).then(r => r.data.data),
  delete: (id: number) => api.delete(`/document-types/${id}`),
}

// ── Parcel Statuses ───────────────────────────────────
export const parcelStatusApi = {
  list: () =>
    api.get<ApiResponse<ParcelStatus[]>>('/parcel-statuses').then(r => r.data.data ?? []),
  // Төлөвийн дүрэм (is_final, locks_progress, …) — илгээгээгүй бол засварт ХЭВЭЭР.
  // Код илгээхгүй: backend id-г sequence-ээс (110…) авч, кодыг id-тай ИЖИЛ болгоно.
  create: (body: { name: string; sort_order?: number; color?: string } & Partial<ParcelStatusRules>) =>
    api.post<ApiResponse<ParcelStatus>>('/parcel-statuses', body).then(r => r.data.data),
  update: (id: number, body: { name?: string; sort_order?: number; color?: string } & Partial<ParcelStatusRules>) =>
    api.put<ApiResponse<ParcelStatus>>(`/parcel-statuses/${id}`, body).then(r => r.data.data),
  delete: (id: number) => api.delete(`/parcel-statuses/${id}`),
}

export const acquisitionWorkflowApi = {
  list: () =>
    api.get<ApiResponse<import('@/types').AcquisitionWorkflow[]>>('/acquisition-workflow').then(r => r.data.data ?? []),
  listStatuses: () =>
    api.get<ApiResponse<import('@/types').AcquisitionStatusItem[]>>('/acquisition-workflow/statuses').then(r => r.data.data ?? []),
  create: (body: { from_status_id: number | null; to_status_id: number; sort_order?: number }) =>
    api.post<{ code: number; data: import('@/types').AcquisitionWorkflow }>('/acquisition-workflow', body).then(r => r.data.data),
  delete: (id: number) => api.delete(`/acquisition-workflow/${id}`),
}

export const acquisitionCategoryApi = {
  list: (parentId?: number) =>
    api.get<ApiResponse<AcquisitionCategory[]>>('/acquisition-categories', {
      params: parentId !== undefined ? { parent_id: parentId } : undefined,
    }).then(r => r.data.data ?? []),
  create: (body: { name: string; parent_id?: number | null; sort_order?: number; department_id?: number | null }) =>
    api.post<{ code: number; data: AcquisitionCategory }>('/acquisition-categories', body).then(r => r.data.data),
  // department_id-г ҮРГЭЛЖ илгээнэ: null нь "хариуцсан алба салгах" гэсэн
  // утгатай тул талбарыг орхивол алба хэзээ ч цуцлагдахгүй болно.
  update: (id: number, body: { name: string; sort_order?: number; department_id?: number | null }) =>
    api.put<ApiResponse<AcquisitionCategory>>(`/acquisition-categories/${id}`, body).then(r => r.data.data),
  delete: (id: number) => api.delete(`/acquisition-categories/${id}`),
}

// ── Захирамжийн төсөл ─────────────────────────────────
export type DecisionDraftListParams = {
  page?: number
  page_size?: number
  proposal_no?: string
  decree_number?: string
  location?: string
  parcel_id?: string
  date_from?: string
  date_to?: string
  duration_year?: number
  status?: number
  acquisition_id?: string
  funding_source_id?: string
  work_type_id?: number
  budget_id?: number
  sort?: string
  order?: 'asc' | 'desc'
}

// parcelListSearchParams-ийн адил — хоосон/0 утгыг query-д огт оруулахгүй.
function decisionDraftSearchParams(params?: DecisionDraftListParams): URLSearchParams {
  const q = new URLSearchParams()
  if (!params) return q
  if (params.page) q.set('page', String(params.page))
  if (params.page_size) q.set('page_size', String(params.page_size))
  if (params.proposal_no) q.set('proposal_no', params.proposal_no)
  if (params.decree_number) q.set('decree_number', params.decree_number)
  if (params.location) q.set('location', params.location)
  if (params.parcel_id) q.set('parcel_id', params.parcel_id)
  if (params.date_from) q.set('date_from', params.date_from)
  if (params.date_to) q.set('date_to', params.date_to)
  if (params.duration_year) q.set('duration_year', String(params.duration_year))
  if (params.status) q.set('status', String(params.status))
  if (params.acquisition_id) q.set('acquisition_id', params.acquisition_id)
  if (params.funding_source_id) q.set('funding_source_id', params.funding_source_id)
  if (params.work_type_id) q.set('work_type_id', String(params.work_type_id))
  if (params.budget_id) q.set('budget_id', String(params.budget_id))
  if (params.sort) q.set('sort', params.sort)
  if (params.order) q.set('order', params.order)
  return q
}

// Санхүүгийн эх үүсвэр энд БАЙХГҮЙ — үүсгэсний дараа addFundingSource-оор
// олноор нэмнэ.
export type DecisionDraftBody = {
  proposal_no: string
  location?: string
  duration_year?: number | null
  work_type_id?: number | null
  budget_id?: number | null
}

export const decisionDraftApi = {
  list: (params?: DecisionDraftListParams) => {
    const suffix = decisionDraftSearchParams(params).toString()
    return api
      .get<PaginatedResponse<DecisionDraft>>(`/decision-drafts${suffix ? `?${suffix}` : ''}`)
      .then(r => r.data)
  },
  get: (id: string) =>
    api.get<ApiResponse<DecisionDraft>>(`/decision-drafts/${id}`).then(r => r.data.data),
  create: (body: DecisionDraftBody) =>
    api.post<ApiResponse<DecisionDraft>>('/decision-drafts', body).then(r => r.data.data),
  update: (id: string, body: DecisionDraftBody) =>
    api.put<ApiResponse<DecisionDraft>>(`/decision-drafts/${id}`, body).then(r => r.data.data),
  delete: (id: string) => api.delete(`/decision-drafts/${id}`),
  // Явц нэмэх — захирамжийн дугаар/огноог бөглөж баталгаажуулна
  // Баталгаажуулах — захирамжийн хавсралт файл (PDF) ЗААВАЛ. Файл нь «Захирамж»
  // төрлөөр захирамжид холбогдсон бүх нэгж талбарын хавсралт болно.
  confirm: (id: string, body: { decree_number: string; decision_date: string; note: string }, file: File) => {
    const fd = new FormData()
    fd.append('decree_number', body.decree_number)
    fd.append('decision_date', body.decision_date)
    fd.append('note', body.note)
    fd.append('file', file, file.name)
    return api.post<ApiResponse<DecisionDraft>>(`/decision-drafts/${id}/confirm`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data)
  },
  addProgress: (id: string, body: { progress_type: string; review_unit_id: number; progress_date: string; note: string }) =>
    api.post<ApiResponse<DecisionDraftProgressHistory>>(`/decision-drafts/${id}/progress`, body).then(r => r.data.data),
  listProgressHistory: (id: string) =>
    api.get<ApiResponse<DecisionDraftProgressHistory[]>>(`/decision-drafts/${id}/progress-history`).then(r => r.data.data ?? []),

  listParcels: (id: string) =>
    api.get<ApiResponse<DecisionDraftParcel[]>>(`/decision-drafts/${id}/parcels`).then(r => r.data.data ?? []),
  // Нэгж талбар холбохдоо түүнийг санхүүжүүлэх эх үүсвэрийг заавал сонгоно
  linkParcel: (id: string, parcelUuid: string, fundingLinkId: string) =>
    api.post<ApiResponse<DecisionDraftParcel[]>>(`/decision-drafts/${id}/parcels`, {
      parcel_uuid: parcelUuid,
      funding_link_id: fundingLinkId,
    }).then(r => r.data.data ?? []),
  // Холбогдсон нэгж талбарын эх үүсвэрийг солих
  setParcelFundingSource: (id: string, linkId: string, fundingLinkId: string) =>
    api.patch<ApiResponse<DecisionDraftParcel[]>>(`/decision-drafts/${id}/parcels/${linkId}/funding-source`, {
      funding_link_id: fundingLinkId,
    }).then(r => r.data.data ?? []),
  unlinkParcel: (id: string, linkId: string) =>
    api.delete<ApiResponse<DecisionDraftParcel[]>>(`/decision-drafts/${id}/parcels/${linkId}`)
      .then(r => r.data.data ?? []),

  // Санхүүгийн эх үүсвэр — олон нэмж болно. Нэмэх/хасах бүгд шинэчлэгдсэн
  // жагсаалтыг буцаана.
  listFundingSources: (id: string) =>
    api.get<ApiResponse<DecisionDraftFundingLink[]>>(`/decision-drafts/${id}/funding-sources`)
      .then(r => r.data.data ?? []),
  addFundingSource: (id: string, fundingSourceId: string, amount: number) =>
    api.post<ApiResponse<DecisionDraftFundingLink[]>>(`/decision-drafts/${id}/funding-sources`, {
      funding_source_id: fundingSourceId,
      amount,
    })
      .then(r => r.data.data ?? []),
  removeFundingSource: (id: string, linkId: string) =>
    api.delete<ApiResponse<DecisionDraftFundingLink[]>>(`/decision-drafts/${id}/funding-sources/${linkId}`)
      .then(r => r.data.data ?? []),

  // Нэгж талбарын "Захирамж" таб
  listByParcel: (parcelUuid: string) =>
    api.get<ApiResponse<DecisionDraftParcel[]>>(`/parcels/${parcelUuid}/decision-drafts`).then(r => r.data.data ?? []),
}

// Санхүүгийн эх үүсвэрийн сонголт — бүх чөлөөлөлтийн funding_sources
export const fundingSourceOptionApi = {
  list: () =>
    api.get<ApiResponse<FundingSourceOption[]>>('/funding-sources').then(r => r.data.data ?? []),
  // Гараар шинэ эх үүсвэр бүртгэнэ — funding_sources хүснэгтэд чөлөөлөлтгүй
  // (бие даасан) мөр болж бичигдэнэ.
  create: (body: {
    organization_name: string
    source_type: string
    amount?: number | null
    currency?: string
    note?: string
  }) => api.post<ApiResponse<FundingSourceOption>>('/funding-sources', body).then(r => r.data.data),
}

// Ажлын төрөл / Төсөв / Төсөл хянах нэгж — parcelStatusApi-тай ижил хэв маяг
function decisionOptionApi(path: string) {
  return {
    list: () => api.get<ApiResponse<DecisionOption[]>>(path).then(r => r.data.data ?? []),
    create: (body: { code: string; name: string; sort_order?: number }) =>
      api.post<ApiResponse<DecisionOption>>(path, body).then(r => r.data.data),
    update: (id: number, body: { code?: string; name?: string; sort_order?: number }) =>
      api.put<ApiResponse<DecisionOption>>(`${path}/${id}`, body).then(r => r.data.data),
    delete: (id: number) => api.delete(`${path}/${id}`),
  }
}

export const decisionWorkTypeApi = decisionOptionApi('/decision-work-types')
export const decisionBudgetApi = decisionOptionApi('/decision-budgets')
/** Төсөл хянах нэгж — «Хянагдаж буй» явцын «Хянагдаж буй газар». */
export const decisionReviewUnitApi = decisionOptionApi('/decision-review-units')

// ── Мэдэгдэл ────────────────────────────────────────
// Бүх хүсэлт _silent — хонхны арын шинэчлэлт бүтэн дэлгэцийн
// блоклогч loader асаахгүй, түр алдаа нь хэрэглэгчид мэдэгдэхгүй.
export const notificationApi = {
  list: (params?: { unread?: boolean; page?: number; page_size?: number }) =>
    api
      .get<PaginatedResponse<import('@/types').AppNotification>>('/notifications', {
        params: { ...(params?.unread ? { unread: true } : {}), page: params?.page ?? 1, page_size: params?.page_size ?? 15 },
        _silent: true,
      })
      .then(r => ({ items: r.data.data ?? [], total: r.data.total ?? 0 })),
  unreadCount: () =>
    api
      .get<ApiResponse<{ count: number }>>('/notifications/unread-count', { _silent: true })
      .then(r => r.data.data?.count ?? 0),
  markRead: (id: string) => api.post(`/notifications/${id}/read`, undefined, { _silent: true }),
  markAllRead: () => api.post('/notifications/read-all', undefined, { _silent: true }),
}

// ── Буулгалтын мэдээлэл ──
function landReleaseParams(f?: LandReleaseFilter) {
  const sp = new URLSearchParams()
  if (f?.search?.trim()) sp.set('search', f.search.trim())
  if (f?.status) sp.set('status', String(f.status))
  if (f?.year) sp.set('year', String(f.year))
  if (f?.structure_type_id) sp.set('structure_type_id', String(f.structure_type_id))
  if (f?.page) sp.set('page', String(f.page))
  if (f?.page_size) sp.set('page_size', String(f.page_size))
  const q = sp.toString()
  return q ? `?${q}` : ''
}

export type LandReleaseDecreeInput = { decree_number: string; decree_date: string; file: File }

function appendDecree(fd: FormData, decree?: LandReleaseDecreeInput | null) {
  if (!decree) return
  fd.append('decree_number', decree.decree_number)
  fd.append('decree_date', decree.decree_date)
  fd.append('decree_file', decree.file, decree.file.name)
}

const multipart = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0 }

export const landReleaseApi = {
  list: (f?: LandReleaseFilter) =>
    api.get<PaginatedResponse<LandRelease>>(`/land-releases${landReleaseParams(f)}`).then(r => r.data),
  map: (f?: LandReleaseFilter) =>
    api.get<ApiResponse<LandReleaseMapItem[]>>(`/land-releases/map${landReleaseParams({ ...f, page: undefined, page_size: undefined })}`).then(r => r.data.data ?? []),
  // Статистик — жагсаалт/газрын зурагтай ИЖИЛ шүүлтээр.
  stats: (f?: LandReleaseFilter) =>
    api.get<ApiResponse<LandReleaseStats>>(`/land-releases/stats${landReleaseParams({ ...f, page: undefined, page_size: undefined })}`).then(r => r.data.data),
  get: (id: string) => api.get<ApiResponse<LandRelease>>(`/land-releases/${id}`).then(r => r.data.data),
  // Файлуудыг уншиж (координатын систем шалгаж) газруудыг буцаана — хадгалахгүй.
  // _silent — попап өөрийн уншиж буй төлөвийг харуулдаг тул бүтэн дэлгэцийн loader асаахгүй.
  preview: (files: File[]) => {
    const fd = new FormData()
    files.forEach(f => fd.append('files', f, f.name))
    return api.post<ApiResponse<LandReleaseFeature[]>>('/land-releases/preview', fd, { ...multipart, _silent: true }).then(r => r.data.data ?? [])
  },
  structureTypes: () =>
    api.get<ApiResponse<LandReleaseStructureType[]>>('/land-releases/structure-types').then(r => r.data.data ?? []),
  // structureType — байгаа төрөл (id) эсвэл ШИНЭ төрөл (name): шинэ нь хадгалахад нэмэгдэнэ.
  create: (body: {
    name: string; description: string; status: number; files: File[]
    structureType: { id: number } | { name: string }
    decree?: LandReleaseDecreeInput | null
    // Зургуудаас (imagesToPdf) үүсгэсэн PDF — бүх газарт холбогдоно.
    photo?: { file: File; pages: number } | null
  }) => {
    const fd = new FormData()
    fd.append('name', body.name)
    fd.append('description', body.description)
    fd.append('status', String(body.status))
    if ('id' in body.structureType) fd.append('structure_type_id', String(body.structureType.id))
    else fd.append('structure_type_name', body.structureType.name)
    body.files.forEach(f => fd.append('files', f, f.name))
    appendDecree(fd, body.decree)
    if (body.photo) {
      fd.append('photo_file', body.photo.file, body.photo.file.name)
      fd.append('photo_pages', String(body.photo.pages))
    }
    return api.post<ApiResponse<{ created: number }>>('/land-releases', fd, multipart).then(r => r.data.data)
  },
  // Газарт зураг нэмэх — зургуудаас (imagesToPdf) үүсгэсэн PDF.
  addPhoto: (id: string, photo: { file: File; pages: number }) => {
    const fd = new FormData()
    fd.append('photo_file', photo.file, photo.file.name)
    fd.append('photo_pages', String(photo.pages))
    return api.post<ApiResponse<LandRelease>>(`/land-releases/${id}/photos`, fd, multipart).then(r => r.data.data)
  },
  changeStatus: (id: string, body: { status: number; note: string; decree?: LandReleaseDecreeInput | null }) => {
    const fd = new FormData()
    fd.append('status', String(body.status))
    fd.append('note', body.note)
    appendDecree(fd, body.decree)
    return api.patch<ApiResponse<LandRelease>>(`/land-releases/${id}/status`, fd, multipart).then(r => r.data.data)
  },
}

export default api
