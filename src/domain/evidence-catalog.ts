export type Category = 'FRAUD' | 'PRODUCT_NOT_RECEIVED' | 'NOT_AS_DESCRIBED' | 'DUPLICATE' | 'CREDIT_NOT_PROCESSED' | 'SUBSCRIPTION';

export const EVIDENCE_CATALOG: Record<Category, string[]> = {
  PRODUCT_NOT_RECEIVED: ['tracking_number', 'carrier_delivery_confirmation', 'signed_proof_of_delivery', 'order_confirmation_email'],
  FRAUD: ['avs_cvv_result', 'device_fingerprint', 'ip_geolocation', 'prior_order_history', 'account_age'],
  NOT_AS_DESCRIBED: ['product_listing_snapshot', 'photos_pre_shipment', 'return_policy_acceptance', 'communication_log'],
  DUPLICATE: ['transaction_log_both_charges', 'refund_evidence_if_processed'],
  CREDIT_NOT_PROCESSED: ['refund_transaction_id', 'refund_timestamp', 'customer_notification'],
  SUBSCRIPTION: ['tos_acceptance', 'cancellation_attempts_log', 'last_login', 'usage_records'],
};
