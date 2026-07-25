/**
 * v1 notification triggers (§2d). The LOGIC is real — who gets notified, on
 * which event, with what payload — but the actual send is intentionally
 * stubbed this session: no email/SMS/push provider call (no Twilio, no
 * transactional email, no FCM/APNs — all deferred per §3). Tests assert
 * `notify()` is called with the right arguments, not that a message
 * physically arrived anywhere, because there's no real provider to test
 * against yet.
 *
 * Exported as an object (not destructured by callers) so tests can
 * `jest.spyOn(notifications, 'notify')` and assert on call arguments.
 */
async function notify({ event, recipientUserIds, payload }) {
  // eslint-disable-next-line no-console
  console.log(
    `[notify] event=${event} recipients=${JSON.stringify(recipientUserIds)} payload=${JSON.stringify(payload)}`
  );
  return { event, recipientUserIds, payload };
}

module.exports = { notify };
