/**
 * Check your order: the insurer's published criteria for this scan, against
 * what the member entered.
 *
 * This is the most defensible screen in the app, so its order is deliberate:
 * what it means (our summary), what the document says (the payer's own words,
 * in quotation marks), which document that is (title, section, version,
 * effective date), and a link to read it.
 *
 * Three states read differently, because they call for different action:
 * criteria not recorded yet, every recorded criterion met, and no criteria
 * recorded for this insurer and scan at all. None of them predicts whether a
 * claim is paid, and the copy must never drift that way.
 */

import { Linking, View } from 'react-native';

import { formatEffective, publisher } from '../citation';
import { Estimate } from '../estimate';
import { Finding, statusLabel } from '../requirements';
import { color, font, radius, space, type } from '../theme';
import { Button, Heading, Link, Screen, T, Tag } from '../ui';

type Props = {
  estimate: Estimate;
  onBack: () => void;
};

function FindingCard({ finding }: { finding: Finding }) {
  const { requirement, status } = finding;
  const open = finding.status === 'met' || finding.status === 'not_applicable';
  return (
    <View style={{ backgroundColor: color.surface, borderRadius: radius.card, padding: space.xl, gap: space.md }}>
      <Tag label={open ? 'Recorded as met' : statusLabel(status)} tone={open ? 'neutral' : 'tint'} />
      <T style={type.rowTitle}>{requirement.summary}</T>
      {requirement.alternative_pathway ? (
        <T style={[type.small, { color: color.inkMuted }]}>One of several ways an order can qualify.</T>
      ) : null}
      <View style={{ backgroundColor: color.canvas, borderRadius: 16, padding: space.lg }}>
        <T style={[type.small, { color: color.inkMuted, fontStyle: 'italic' }]}>“{requirement.quote}”</T>
      </View>
      <T style={[type.caption, { color: color.inkSubtle }]}>
        {publisher(requirement)} · {requirement.document_title} · {requirement.section_id} · version{' '}
        {requirement.version} · effective {formatEffective(requirement.effective_date)}
      </T>
      <Link label="Read the document ›" onPress={() => Linking.openURL(requirement.source_url).catch(() => undefined)} />
    </View>
  );
}

export function Checklist({ estimate, onBack }: Props) {
  const { applicable, unmet, procedure } = estimate;
  const met = applicable.filter((finding) => !unmet.includes(finding));
  const who = applicable[0] ? publisher(applicable[0].requirement) : null;

  let lead: string;
  if (applicable.length === 0) {
    lead = `No published criteria are recorded for ${estimate.payerLabel} and a ${procedure.label.toLowerCase()}. Preclear only checks criteria it has read and can cite.`;
  } else if (unmet.length === 0) {
    lead = `Every criterion ${who} publishes for this order is recorded as met.`;
  } else {
    lead = `${who} publishes criteria for this scan. Your order doesn’t record ${unmet.length === 1 ? 'one of them' : `${unmet.length} of them`} yet. This is paperwork to ask your doctor’s office about, not a coverage decision.`;
  }

  return (
    <Screen onBack={onBack} footer={<Button label="Got it" onPress={onBack} />}>
      <Heading>Check your order</Heading>
      <T style={[type.body, { color: color.inkMuted, marginTop: space.sm, marginBottom: space.xl }]}>{lead}</T>
      <View style={{ gap: space.md }}>
        {[...unmet, ...met].map((finding) => (
          <FindingCard key={finding.requirement.key} finding={finding} />
        ))}
      </View>
      {applicable.length > 0 ? (
        <T style={[type.caption, { color: color.inkSubtle, marginTop: space.lg, paddingHorizontal: space.xs, fontFamily: font.medium }]}>
          Based on what you entered. Your doctor’s chart may already record these.
        </T>
      ) : null}
    </Screen>
  );
}
