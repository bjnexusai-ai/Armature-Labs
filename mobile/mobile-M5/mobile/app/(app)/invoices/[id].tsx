import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../../src/components/Card';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { ENDPOINTS } from '../../../src/constants/endpoints';
import { useAuth } from '../../../src/lib/auth/AuthContext';
import { useApi } from '../../../src/lib/useApi';
import { colors, fontFamily, radius, spacing, typeScale } from '../../../src/theme/theme';
import type { InvoiceDetailResponse, InvoiceStatus } from '../../../src/types/domain';

const INVOICE_STATUS_TONE: Record<InvoiceStatus, 'teal' | 'green' | 'coral' | 'amber' | 'tan'> = {
  Draft: 'tan',
  Sent: 'teal',
  'Partially Paid': 'amber',
  Paid: 'green',
  Void: 'coral',
};

function formatCurrency(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : amount;
}

/**
 * GET /api/billing/invoices/:id — same requireInvoiceReadAccess gate as
 * the list. The list screen already keeps a canViewInvoices===false user
 * from ever reaching this route, but if a wrong-practice invoice id were
 * somehow opened, assertPracticeAccess in getInvoice would 403 — useApi's
 * messageFor already renders that as "You don't have access to this."
 *
 * Read-only per the M4 brief §4: no "Pay now" / Checkout UI this session
 * — plan §6 item 5 (whether Stripe Checkout is in scope for mobile M4)
 * was never answered by the client, so this defaults to out of scope
 * rather than building ahead of that decision.
 */
export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const canViewInvoices = state.status === 'signedIn' && state.user.canViewInvoices;

  const { data, loading, refreshing, error, refetch } = useApi<InvoiceDetailResponse>(
    id && canViewInvoices ? ENDPOINTS.invoiceDetail(id) : null
  );

  if (!canViewInvoices) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>
          Your account doesn't have permission to view invoices.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading invoice…</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? 'Invoice not found.'}</Text>
      </View>
    );
  }

  const { invoice } = data;
  const balance = Number(invoice.subtotal) - Number(invoice.amount_paid);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} />}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
          <StatusBadge label={invoice.status} tone={INVOICE_STATUS_TONE[invoice.status]} />
        </View>
        <Text style={styles.date}>
          {new Date(invoice.created_at).toLocaleDateString()}
        </Text>
      </View>

      <Card style={styles.summaryCard}>
        <SummaryRow label="Subtotal" value={formatCurrency(invoice.subtotal)} />
        <SummaryRow label="Paid" value={formatCurrency(invoice.amount_paid)} />
        <View style={styles.divider} />
        <SummaryRow
          label="Balance"
          value={formatCurrency(String(balance))}
          emphasize={balance > 0}
        />
      </Card>

      {invoice.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notes}>{invoice.notes}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Line items</Text>
        {invoice.lineItems.map((item) => (
          <View key={item.id} style={styles.lineItem}>
            <View style={styles.lineItemMain}>
              <Text style={styles.lineDescription}>{item.description}</Text>
              <Text style={styles.lineMeta}>
                {item.quantity} × {formatCurrency(item.unit_price)}
              </Text>
            </View>
            <Text style={styles.lineTotal}>{formatCurrency(item.line_total)}</Text>
          </View>
        ))}
      </View>

      {invoice.payments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payments</Text>
          {invoice.payments.map((payment) => (
            <View key={payment.id} style={styles.lineItem}>
              <View style={styles.lineItemMain}>
                <Text style={styles.lineDescription}>{payment.method}</Text>
                <Text style={styles.lineMeta}>
                  {new Date(payment.created_at).toLocaleDateString()}
                  {payment.reference_note ? ` · ${payment.reference_note}` : ''}
                </Text>
              </View>
              <Text style={styles.lineTotal}>{formatCurrency(payment.amount)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function SummaryRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, emphasize && styles.summaryValueEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, flexGrow: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  muted: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  error: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: typeScale.body,
    color: colors.danger,
    textAlign: 'center',
  },
  header: { gap: spacing.xs },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceNumber: {
    fontFamily: fontFamily.headingExtraBold,
    fontSize: typeScale.h1,
    color: colors.ink,
  },
  date: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
  },
  summaryCard: { gap: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.inkSoft,
  },
  summaryValue: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.body,
    color: colors.ink,
  },
  summaryValueEmphasis: {
    color: colors.primaryTeal,
    fontFamily: fontFamily.headingBold,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  section: { gap: spacing.md },
  sectionTitle: {
    fontFamily: fontFamily.headingBold,
    fontSize: typeScale.h2,
    color: colors.ink,
  },
  notes: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.ink,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
  },
  lineItemMain: { flex: 1, paddingRight: spacing.md },
  lineDescription: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.body,
    color: colors.ink,
  },
  lineMeta: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },
  lineTotal: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.body,
    color: colors.ink,
  },
});
