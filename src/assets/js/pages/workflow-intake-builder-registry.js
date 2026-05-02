/**
 * Fallback registry for Customer Intake Builder options.
 * Used when service-specific intake builder data is not available yet.
 */

const SINGLE_PARTNER_INTAKE_BUILDERS_FALLBACK = [
  {
    id: "default_customer_intake",
    value: "default_customer_intake",
    display_name: "기본 고객 Intake Builder",
    label: "기본 고객 Intake Builder",
    meta: "Fallback",
  },
];

function getSinglePartnerIntakeBuilderFallbackOptions() {
  return SINGLE_PARTNER_INTAKE_BUILDERS_FALLBACK.map((x) => ({ ...x }));
}

export { getSinglePartnerIntakeBuilderFallbackOptions };
