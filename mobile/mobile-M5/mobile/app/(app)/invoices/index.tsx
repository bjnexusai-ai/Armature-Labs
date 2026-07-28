import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../../src/components/Card';
import { LogoutButton } from '../../../src/components/LogoutButton';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { ENDPOINTS } from '../../../src/constants/endpoints';
import { useAuth } from '../../../src/lib/auth/AuthContext';
import { useApi } from '../../../src/lib/useApi';
import { colors, fontFamily, spacing, typeScale } from '../../../src/theme/theme';
import type { InvoicesListResponse, InvoiceStatus, InvoiceSummary } from '../../../src/types/domain';

const INVOICE_STATUS_TONE: Record<InvoiceStatus, 'teal' | 'green' | 'coral' | 'amber' | 'tan'> = {
  Draft: 'tan',
  Sent: 'teal',
  'Partially Paid': 'amber',
  Paid: 'green',
  Void: 'coral',
};

/** No currency field anywhere on invoices/payments in the backend schema —
 * "$" is a mobile-side display assumption (client is US-based per the
 * plan doc), not something confirmed from the API. */
function formatCurrency(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : amount;
}

/**
 * GET /api/billing/invoices — gated on can_view_invoices for a
 * dentist_client (requireInvoiceReadAccess in billing.routes.js). Gated
 * client-side here too: if the flag is false, useApi is never even given
 * a path, so the 403 the backend would return is never hit or shown —
 * the person just sees the "no access" state below.
 */
export default function InvoicesScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const canViewInvoices = state.status === 'signedIn' && state.user.canViewInvoices;

  const { data, loading, refreshing, error, refetch } = useApi<InvoicesListResponse>(
    canViewInvoices ? ENDPOINTS.invoices : null
  );

  if (!canViewInvoices) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>
          Your account doesn't have permission to view invoices. Contact your practice's account
          administrator if you think this is wrong.
        </Text>
        <LogoutButton />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading invoices…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={refetch}>
          <Text style={styles.retry}>Tap to retry</Text>
        </Pressable>
      </View>
    );
  }

  const invoices = data?.invoices ?? [];

  return (
    <FlatList
      data={invoices}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} />}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.muted}>No invoices yet.</Text>
        </View>
      }
      ListFooterComponent={<LogoutButton />}
      renderItem={({ item }) => (
        <InvoiceRow invoice={item} onPress={() => router.push(`/(app)/invoices/${item.id}`)} />
      )}
    />
  );
}

function InvoiceRow({ invoice, onPress }: { invoice: InvoiceSummary; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.rowWrapper}>
      <Card>
        <View style={styles.rowTop}>
          <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
          <StatusBadge label={invoice.status} tone={INVOICE_STATUS_TONE[invoice.status]} />
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.amount}>{formatCurrency(invoice.subtotal)}</Text>
          {Number(invoice.amount_paid) > 0 && (
            <Text style={styles.meta}>{formatCurrency(invoice.amount_paid)} paid</Text>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
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
  retry: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: typeScale.bodySmall,
    color: colors.buttonGreen,
  },
  rowWrapper: { marginBottom: spacing.sm },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  invoiceNumber: {
    fontFamily: fontFamily.mono,
    fontSize: typeScale.mono,
    color: colors.inkSoft,
  },
  rowBottom: { flexDirection: 'row', gap: spacing.md, alignItems: 'baseline' },
  amount: {
    fontFamily: fontFamily.headingBold,
    fontSize: typeScale.h3,
    color: colors.ink,
  },
  meta: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
  },
});
