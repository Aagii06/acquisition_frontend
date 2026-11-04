// ── Professional Org API ──────────────────────────────────────────────────────
// Мэргэжлийн байгууллагын хэрэглэгчид ашиглах бүх API дуудлага.
// Backend-д /prof prefix-тэй тусдаа route group байна —
// JWT-ийн `valuation_org` claim + org_id-оор хамгаалагдана.

import apiClient, { appendDocumentPayment, type DocumentPaymentInput } from '@/lib/api'
import type {
  ApiResponse,
  PaginatedResponse,
  LandAcquisition,
  AcquisitionSocioSurvey,
  Parcel,
  ParcelFull,
  ParcelStatus,
  ParcelStatusHistory,
  ValuationSubmission,
  ValuationSubmissionHistory,
  ValuationSnapshot,
  Asset,
  AssetSpec,
  AssetCalculation,
  AssetSpecType,
  AssetCalcType,
  Compensation,
  CompensationHistory,
  CompensationGrant,
  LandValuation,
  LandValuationUpsert,
  ValuationImportPayload,
  ValuationSectionNote,
  ValuationNotesPayload,
  ValuationImportResult,
  Document,
  ParcelHolder,
  RepresentativeInput,
  FundingSource,
  AcquisitionCategory,
} from '@/types'

// ── Filter types ──────────────────────────────────────────────────────────────

export type ProfMyAcquisitionFilter = {
  plan_code?: string
  acquisition_name?: string
  status?: number
  au3_code?: string
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export type ProfParcelListParams = {
  page?: number
  page_size?: number
  parcel_id?: string
  au1_code?: string
  au2_code?: string
  au3_code?: string
  right_type?: number
  landuse?: string
  status_id?: number
  /** БАЙРШЛЫН давхардал: "1" зөвхөн давхардалтай, "0" зөвхөн давхардалгүй */
  has_overlap?: string
  /** Эрэмбэлэх багана (backend-ийн зөвшөөрөгдсөн түлхүүр) ба чиглэл. */
  sort?: string
  order?: 'asc' | 'desc'
}

export type ProfAssetListParams = {
  page?: number
  page_size?: number
  parcel_id?: string
  valuation_type?: string
}

// ── ProfApi class ─────────────────────────────────────────────────────────────

class ProfApiService {
  // ── Миний чөлөөлөлтүүд ─────────────────────────────────────────────────────
  // GET /prof/land-acquisitions (ListMyAcquisitions хандлага)

  profListMyAcquisitions(filter?: ProfMyAcquisitionFilter): Promise<PaginatedResponse<LandAcquisition>> {
    const p = new URLSearchParams()
    if (filter?.plan_code)        p.set('plan_code', filter.plan_code)
    if (filter?.acquisition_name) p.set('acquisition_name', filter.acquisition_name)
    if (filter?.status)           p.set('status', String(filter.status))
    if (filter?.au3_code)         p.set('au3_code', filter.au3_code)
    if (filter?.sort)             p.set('sort', filter.sort)
    if (filter?.order)            p.set('order', filter.order)
    if (filter?.page)             p.set('page', String(filter.page))
    if (filter?.page_size)        p.set('page_size', String(filter.page_size))
    return apiClient
      .get<PaginatedResponse<LandAcquisition>>(`/prof/land-acquisitions?${p.toString()}`)
      .then(r => r.data)
  }

  // ── Чөлөөлөлт ──────────────────────────────────────────────────────────────

  profGetAcquisition(id: string): Promise<LandAcquisition | undefined> {
    return apiClient
      .get<ApiResponse<LandAcquisition>>(`/prof/land-acquisitions/${id}`)
      .then(r => r.data.data)
  }

  profListCategories(parentId?: number): Promise<AcquisitionCategory[]> {
    return apiClient
      .get<ApiResponse<AcquisitionCategory[]>>('/acquisition-categories', {
        params: parentId !== undefined ? { parent_id: parentId } : undefined,
      })
      .then(r => r.data.data ?? [])
  }

  profListAcquisitionDocuments(acqId: string): Promise<Document[]> {
    return apiClient
      .get<ApiResponse<Document[]>>(`/prof/land-acquisitions/${acqId}/documents`)
      .then(r => r.data.data ?? [])
  }

  profGetSocioSurvey(acqId: string): Promise<AcquisitionSocioSurvey | null> {
    return apiClient
      .get<ApiResponse<AcquisitionSocioSurvey | null>>(`/prof/land-acquisitions/${acqId}/socio-survey`)
      .then(r => r.data.data ?? null)
  }

  profUploadAcquisitionDocument(acqId: string, file: File, documentTypeId?: number, name?: string): Promise<Document | undefined> {
    const fd = new FormData()
    fd.append('file', file)
    if (documentTypeId) fd.append('document_type_id', String(documentTypeId))
    if (name?.trim()) fd.append('name', name.trim())
    return apiClient
      .post<ApiResponse<Document>>(`/prof/land-acquisitions/${acqId}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data.data)
  }

  profDeleteAcquisitionDocument(acqId: string, docId: string): Promise<void> {
    return apiClient.delete(`/prof/land-acquisitions/${acqId}/documents/${docId}`)
  }

  // ── Нэгж талбар ────────────────────────────────────────────────────────────

  profListParcels(acqId: string, params?: ProfParcelListParams): Promise<PaginatedResponse<Parcel>> {
    return apiClient
      .get<PaginatedResponse<Parcel>>(`/prof/land-acquisitions/${acqId}/parcels`, { params })
      .then(r => r.data)
  }

  profGetParcel(acqId: string, parcelId: string): Promise<ParcelFull | undefined> {
    return apiClient
      .get<ApiResponse<ParcelFull>>(`/prof/land-acquisitions/${acqId}/parcels/${parcelId}`)
      .then(r => r.data.data)
  }

  profSetParcelIndependentOrg(acqId: string, parcelId: string, orgId: string | null): Promise<unknown> {
    return apiClient.patch(
      `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/independent-org`,
      { org_id: orgId },
    )
  }

  // ── Нэгж талбарын статус ────────────────────────────────────────────────────

  profGetParcelAvailableStatuses(acqId: string, parcelId: string): Promise<ParcelStatus[]> {
    return apiClient
      .get<ApiResponse<ParcelStatus[]>>(
        `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/available-statuses`,
      )
      .then(r => r.data.data ?? [])
  }

  profUpdateParcelStatus(acqId: string, parcelId: string, statusId: number): Promise<unknown> {
    return apiClient.patch(
      `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/status`,
      { status_id: statusId },
    )
  }

  profListParcelStatusHistory(acqId: string, parcelId: string): Promise<ParcelStatusHistory[]> {
    return apiClient
      .get<ApiResponse<ParcelStatusHistory[]>>(
        `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/status-history`,
      )
      .then(r => r.data.data ?? [])
  }

  // ── Нөхөх олговрын үнэлгээний илгээх/зөвшөөрөх төлөв ──────────────────────────
  profGetValuationSubmission(acqId: string, parcelId: string, valuationType?: string): Promise<ValuationSubmission | undefined> {
    return apiClient
      .get<ApiResponse<ValuationSubmission>>(
        `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/valuation-status`,
        { params: { valuation_type: valuationType } },
      )
      .then(r => r.data.data)
  }

  profTransitionValuationSubmission(
    acqId: string,
    parcelId: string,
    action: "submit" | "approve" | "return" | "cancel",
    note: string,
    valuationType?: string,
    // ЗААВАЛ БИШ хавсралт — зөвхөн буцаалтад. Мэргэжлийн байгууллага
    // буцаадаггүй ч интерфейсийг ижил байлгав (нэг компонент дуудна).
    file?: File | null,
  ): Promise<ValuationSubmission | undefined> {
    const url = `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/valuation-status`
    if (file) {
      const fd = new FormData()
      fd.append('action', action)
      fd.append('note', note)
      if (valuationType) fd.append('valuation_type', valuationType)
      fd.append('file', file)
      return apiClient
        .post<ApiResponse<ValuationSubmission>>(url, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then(r => r.data.data)
    }
    return apiClient
      .post<ApiResponse<ValuationSubmission>>(url, { action, note, valuation_type: valuationType })
      .then(r => r.data.data)
  }

  profListValuationSubmissionHistory(acqId: string, parcelId: string, valuationType?: string): Promise<ValuationSubmissionHistory[]> {
    return apiClient
      .get<ApiResponse<ValuationSubmissionHistory[]>>(
        `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/valuation-status-history`,
        { params: { valuation_type: valuationType } },
      )
      .then(r => r.data.data ?? [])
  }

  profListValuationSnapshots(acqId: string, parcelId: string, valuationType?: string): Promise<ValuationSnapshot[]> {
    return apiClient
      .get<ApiResponse<ValuationSnapshot[]>>(
        `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/valuation-snapshots`,
        { params: { valuation_type: valuationType } },
      )
      .then(r => r.data.data ?? [])
  }

  // ── Нэгж талбарын баримт бичиг ──────────────────────────────────────────────

  profListParcelDocuments(parcelId: string): Promise<Document[]> {
    return apiClient
      .get<ApiResponse<Document[]>>(`/prof/parcels/${parcelId}/documents`)
      .then(r => r.data.data ?? [])
  }

  profUploadParcelDocument(parcelId: string, file: File, documentTypeId?: number, name?: string, payment?: DocumentPaymentInput): Promise<Document | undefined> {
    const fd = new FormData()
    fd.append('file', file)
    if (documentTypeId) fd.append('document_type_id', String(documentTypeId))
    if (name?.trim()) fd.append('name', name.trim())
    appendDocumentPayment(fd, payment)
    return apiClient
      .post<ApiResponse<Document>>(`/prof/parcels/${parcelId}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(r => r.data.data)
  }

  profDeleteParcelDocument(parcelId: string, docId: string): Promise<void> {
    return apiClient.delete(`/prof/parcels/${parcelId}/documents/${docId}`)
  }

  // ── Эрх эзэмшигч төлөөлөгч ─────────────────────────────────────────────────

  profListRepresentatives(acqId: string, parcelId: string): Promise<ParcelHolder[]> {
    return apiClient
      .get<ApiResponse<ParcelHolder[]>>(
        `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/representatives`,
      )
      .then(r => r.data.data ?? [])
  }

  profCreateRepresentative(
    acqId: string,
    parcelId: string,
    body: RepresentativeInput,
  ): Promise<ParcelHolder | undefined> {
    return apiClient
      .post<ApiResponse<ParcelHolder>>(
        `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/representatives`,
        body,
      )
      .then(r => r.data.data)
  }

  profDeleteRepresentative(acqId: string, parcelId: string, repId: string): Promise<void> {
    return apiClient.delete(
      `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/representatives/${repId}`,
    )
  }

  /** Нөхөн төлбөр хүлээн авах эзэмшигчийг сонгох */
  profSetPaymentRecipient(acqId: string, parcelId: string, holderId: string): Promise<void> {
    return apiClient.put(
      `/prof/land-acquisitions/${acqId}/parcels/${parcelId}/payment-recipient`,
      { holder_id: holderId },
    )
  }

  // ── Байгууламж ──────────────────────────────────────────────────────────────

  profListAssets(acqId: string, params?: ProfAssetListParams): Promise<PaginatedResponse<Asset>> {
    return apiClient
      .get<PaginatedResponse<Asset>>(`/prof/land-acquisitions/${acqId}/assets`, { params })
      .then(r => r.data)
  }

  profCreateAsset(acqId: string, body: Partial<Asset>): Promise<Asset | undefined> {
    return apiClient
      .post<ApiResponse<Asset>>(`/prof/land-acquisitions/${acqId}/assets`, body)
      .then(r => r.data.data)
  }

  profUpdateAsset(acqId: string, assetId: string, body: Partial<Asset>): Promise<Asset | undefined> {
    return apiClient
      .put<ApiResponse<Asset>>(`/prof/land-acquisitions/${acqId}/assets/${assetId}`, body)
      .then(r => r.data.data)
  }

  profDeleteAsset(acqId: string, assetId: string): Promise<void> {
    return apiClient.delete(`/prof/land-acquisitions/${acqId}/assets/${assetId}`)
  }

  profListAssetSpecs(acqId: string, assetId: string): Promise<AssetSpec[]> {
    return apiClient
      .get<ApiResponse<AssetSpec[]>>(
        `/prof/land-acquisitions/${acqId}/assets/${assetId}/specs`,
      )
      .then(r => r.data.data ?? [])
  }

  profUpsertAssetSpecs(
    acqId: string,
    assetId: string,
    specs: { spec_type_id: number; value: string }[],
  ): Promise<unknown> {
    return apiClient.post(
      `/prof/land-acquisitions/${acqId}/assets/${assetId}/specs`,
      { specs },
    )
  }

  profListAssetCalculations(acqId: string, assetId: string): Promise<AssetCalculation[]> {
    return apiClient
      .get<ApiResponse<AssetCalculation[]>>(
        `/prof/land-acquisitions/${acqId}/assets/${assetId}/calculations`,
      )
      .then(r => r.data.data ?? [])
  }

  profUpsertAssetCalculations(
    acqId: string,
    assetId: string,
    calculations: { calc_type_id: number; unit: string; value: number; group?: string }[],
  ): Promise<unknown> {
    return apiClient.post(
      `/prof/land-acquisitions/${acqId}/assets/${assetId}/calculations`,
      { calculations },
    )
  }

  // ── Байгууламжийн төрлүүд (лавлах) ─────────────────────────────────────────

  profListAssetSpecTypes(): Promise<AssetSpecType[]> {
    return apiClient
      .get<ApiResponse<AssetSpecType[]>>('/asset-spec-types')
      .then(r => r.data.data ?? [])
  }

  profListAssetCalcTypes(): Promise<AssetCalcType[]> {
    return apiClient
      .get<ApiResponse<AssetCalcType[]>>('/asset-calc-types')
      .then(r => r.data.data ?? [])
  }

  // ── Нөхөх олговор ──────────────────────────────────────────────────────────

  profListCompensations(acqId: string, parcelId?: string, valuationType?: string): Promise<Compensation[]> {
    return apiClient
      .get<ApiResponse<Compensation[]>>(`/prof/land-acquisitions/${acqId}/compensations`, {
        params: { parcel_id: parcelId || undefined, valuation_type: valuationType || undefined },
      })
      .then(r => r.data.data ?? [])
  }

  profCreateCompensation(acqId: string, body: Partial<Compensation>): Promise<Compensation | undefined> {
    return apiClient
      .post<ApiResponse<Compensation>>(`/prof/land-acquisitions/${acqId}/compensations`, body)
      .then(r => r.data.data)
  }

  // Олговрын дүн/тайлбарыг засах. Тооцооллын мөр өөрчлөгдөхөд хөрөнгийн
  // олговрын дүн ЭНЭ дуудлагаар шинэчлэгдэнэ (эс бөгөөс нэгдсэн дүн зөрнө).
  profUpdateCompensation(
    acqId: string,
    compId: string,
    body: Partial<Compensation>,
  ): Promise<Compensation | undefined> {
    return apiClient
      .put<ApiResponse<Compensation>>(`/prof/land-acquisitions/${acqId}/compensations/${compId}`, body)
      .then(r => r.data.data)
  }

  profDeleteCompensation(acqId: string, compId: string): Promise<void> {
    return apiClient.delete(`/prof/land-acquisitions/${acqId}/compensations/${compId}`)
  }

  profListCompensationHistory(acqId: string, compId: string): Promise<CompensationHistory[]> {
    return apiClient
      .get<ApiResponse<CompensationHistory[]>>(
        `/prof/land-acquisitions/${acqId}/compensations/${compId}/history`,
      )
      .then(r => r.data.data ?? [])
  }

  profUploadCompensationReport(acqId: string, compId: string, file: File): Promise<Compensation | undefined> {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient
      .post<ApiResponse<Compensation>>(
        `/prof/land-acquisitions/${acqId}/compensations/${compId}/report`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      .then(r => r.data.data)
  }

  profUploadAssetPhoto(acqId: string, assetId: string, file: File): Promise<{ photo_pdf_url: string; photo_pdf_name: string } | undefined> {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient
      .post<ApiResponse<{ photo_pdf_url: string; photo_pdf_name: string }>>(
        `/prof/land-acquisitions/${acqId}/assets/${assetId}/photos`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      .then(r => r.data.data)
  }

  profCreateCompensationGrant(acqId: string, compId: string, body: Partial<CompensationGrant>): Promise<CompensationGrant | undefined> {
    return apiClient
      .post<ApiResponse<CompensationGrant>>(
        `/prof/land-acquisitions/${acqId}/compensations/${compId}/grant`,
        body,
      )
      .then(r => r.data.data)
  }

  profUpdateCompensationGrant(acqId: string, compId: string, body: Partial<CompensationGrant>): Promise<CompensationGrant | undefined> {
    return apiClient
      .put<ApiResponse<CompensationGrant>>(
        `/prof/land-acquisitions/${acqId}/compensations/${compId}/grant`,
        body,
      )
      .then(r => r.data.data)
  }

  profDeleteCompensationGrant(acqId: string, compId: string): Promise<void> {
    return apiClient.delete(`/prof/land-acquisitions/${acqId}/compensations/${compId}/grant`)
  }

  // ── Газрын үнэлгээ ──────────────────────────────────────────────────────────

  profGetLandValuation(acqId: string, parcelId: string, valuationType?: string): Promise<LandValuation | null> {
    return apiClient
      .get<ApiResponse<LandValuation | null>>(
        `/prof/land-acquisitions/${acqId}/land-valuation`,
        { params: { parcel_id: parcelId, valuation_type: valuationType } },
      )
      .then(r => r.data.data ?? null)
  }

  profDeleteLandValuation(acqId: string, parcelId: string, valuationType?: string): Promise<void> {
    return apiClient
      .delete(`/prof/land-acquisitions/${acqId}/land-valuation`, { params: { parcel_id: parcelId, valuation_type: valuationType } })
      .then(() => undefined)
  }

  profUpsertLandValuation(
    acqId: string,
    body: LandValuationUpsert,
  ): Promise<LandValuation | undefined> {
    return apiClient
      .post<ApiResponse<LandValuation>>(
        `/prof/land-acquisitions/${acqId}/land-valuation`,
        body,
      )
      .then(r => r.data.data)
  }

  profImportValuation(
    acqId: string,
    body: ValuationImportPayload,
  ): Promise<ValuationImportResult | undefined> {
    return apiClient
      .post<ApiResponse<ValuationImportResult>>(
        `/prof/land-acquisitions/${acqId}/valuation-import`,
        body,
      )
      .then(r => r.data.data)
  }

  // ── Үнэлгээний хүснэгтийн тайлбар ───────────────────────────────────────────

  profListValuationNotes(
    acqId: string,
    parcelId: string,
    valuationType?: string,
  ): Promise<ValuationSectionNote[]> {
    return apiClient
      .get<ApiResponse<ValuationSectionNote[]>>(
        `/prof/land-acquisitions/${acqId}/valuation-notes`,
        { params: { parcel_id: parcelId, valuation_type: valuationType || undefined } },
      )
      .then(r => r.data.data ?? [])
  }

  profSaveValuationNotes(
    acqId: string,
    body: ValuationNotesPayload,
  ): Promise<ValuationSectionNote[]> {
    return apiClient
      .put<ApiResponse<ValuationSectionNote[]>>(
        `/prof/land-acquisitions/${acqId}/valuation-notes`,
        body,
      )
      .then(r => r.data.data ?? [])
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const profApi = new ProfApiService()
export { ProfApiService }
