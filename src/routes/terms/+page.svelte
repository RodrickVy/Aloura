<script lang="ts">
  import { page } from '$app/stores';
</script>

<svelte:head>
  <title>Terms &amp; Conditions - Aloura</title>
  <meta name="description" content="Aloura Terms & Conditions." />
  <link rel="canonical" href="{$page.url.origin}/terms" />
</svelte:head>

<div class="legal">
  <div class="legal__inner">
    <p class="eyebrow">Legal</p>
    <h1 class="legal__title">Terms &amp; Conditions</h1>
    <p class="legal__date">Effective Date: May 23, 2026</p>

    <h2>1. Acceptance of Terms</h2>
    <p>By accessing or using Aloura (the "Platform", "Service", "we", "our", or "us"), you agree to be legally bound by these Terms &amp; Conditions. If you do not agree with any part of these Terms, you must discontinue use of the Platform immediately.</p>
    <p>These Terms apply to all visitors, users, creators, customers, and anyone who accesses or interacts with the Platform.</p>

    <h2>2. About Aloura</h2>
    <p>Aloura is an AI-powered fashion and style discovery platform that allows users to:</p>
    <ul>
      <li>Upload outfit inspiration and fashion-related content</li>
      <li>Receive AI-generated style analysis and recommendations</li>
      <li>Explore personalized aesthetics, mood boards, and outfit suggestions</li>
      <li>Discover clothing items, brands, and related shopping opportunities</li>
      <li>Save and organize style preferences and inspiration</li>
    </ul>

    <h2>3. User Accounts</h2>
    <p>You may be required to create an account to access certain features. You agree to:</p>
    <ul>
      <li>Provide accurate and current information</li>
      <li>Maintain the security of your account credentials</li>
      <li>Accept responsibility for activity under your account</li>
      <li>Notify us immediately of unauthorized access or security breaches</li>
    </ul>
    <p>We reserve the right to suspend or terminate accounts that violate these Terms or engage in abusive, fraudulent, or harmful conduct.</p>

    <h2>4. AI-Generated Recommendations</h2>
    <p>Aloura uses artificial intelligence and automated systems to generate fashion recommendations, aesthetic analysis, outfit suggestions, and related content.</p>
    <p>AI-generated outputs are provided for informational, entertainment, and personalization purposes only. Results may not always be accurate, complete, unbiased, or suitable for every individual.</p>
    <p>Users acknowledge that fashion recommendations and visual analyses are subjective and should not be interpreted as professional, medical, psychological, or body-image advice.</p>

    <h2>5. User Content</h2>
    <p>You retain ownership of the images, uploads, comments, and other content you submit ("User Content"). By uploading content to Aloura, you grant us a worldwide, non-exclusive, royalty-free license to:</p>
    <ul>
      <li>Host, store, process, reproduce, and display your content</li>
      <li>Improve AI systems and personalization features</li>
      <li>Operate and enhance the Platform</li>
      <li>Create anonymized analytical insights</li>
    </ul>
    <p>You represent that you own or have permission to use any content uploaded to the Platform.</p>

    <h2>6. Prohibited Conduct</h2>
    <p>You agree not to:</p>
    <ul>
      <li>Upload illegal, infringing, abusive, or harmful content</li>
      <li>Harass, impersonate, or exploit other users</li>
      <li>Attempt to reverse engineer or interfere with the Platform</li>
      <li>Use bots, scraping tools, or unauthorized automation</li>
      <li>Upload malware, viruses, or malicious code</li>
      <li>Use the Platform for unlawful or fraudulent purposes</li>
    </ul>

    <h2>7. Intellectual Property</h2>
    <p>All trademarks, branding, logos, interfaces, designs, software, algorithms, and platform content belonging to Aloura are protected by intellectual property laws.</p>
    <p>You may not copy, distribute, modify, reproduce, sell, or exploit any portion of the Platform without prior written consent.</p>

    <h2>8. Third-Party Services &amp; Links</h2>
    <p>Aloura may include integrations, affiliate links, social media content, or connections to third-party websites, products, and services.</p>
    <p>We are not responsible for third-party content, availability, pricing, policies, or practices. Your interactions with third parties are governed by their respective terms and policies.</p>

    <h2>9. Purchases &amp; Affiliate Relationships</h2>
    <p>Some products shown through Aloura may include affiliate links or commission-based relationships with retailers and brands.</p>
    <p>Prices, availability, and product information are subject to change without notice. Aloura does not guarantee the quality, fit, authenticity, or delivery of third-party products.</p>

    <h2>10. Termination</h2>
    <p>We reserve the right to suspend, restrict, or terminate access to the Platform at our sole discretion, with or without notice, for conduct that violates these Terms or may expose Aloura or its users to risk.</p>

    <h2>11. Disclaimer of Warranties</h2>
    <p>The Platform is provided on an "as is" and "as available" basis without warranties of any kind, express or implied.</p>
    <p>We do not guarantee uninterrupted access, error-free functionality, or complete accuracy of recommendations, AI outputs, or platform content.</p>

    <h2>12. Limitation of Liability</h2>
    <p>To the fullest extent permitted by law, Aloura and its affiliates, founders, employees, contractors, and partners shall not be liable for indirect, incidental, consequential, special, or punitive damages arising from:</p>
    <ul>
      <li>Use or inability to use the Platform</li>
      <li>AI-generated recommendations or outputs</li>
      <li>User-generated content</li>
      <li>Third-party products or services</li>
      <li>Unauthorized access or data breaches</li>
    </ul>

    <h2>13. Indemnification</h2>
    <p>You agree to indemnify and hold harmless Aloura and its affiliates from claims, liabilities, damages, losses, and expenses resulting from your use of the Platform, your violation of these Terms, or your infringement of third-party rights.</p>

    <h2>14. Changes to These Terms</h2>
    <p>We may update these Terms periodically. Continued use of the Platform after changes become effective constitutes acceptance of the revised Terms.</p>

    <h2>15. Governing Law</h2>
    <p>These Terms shall be governed by and interpreted in accordance with the laws of the Province of British Columbia and applicable Canadian laws, without regard to conflict-of-law principles.</p>

    <h2>16. Contact Information</h2>
    <p>For legal inquiries, support, or concerns regarding these Terms, contact:</p>
    <p>Aloura Legal Team<br/>
    Email: <a href="mailto:aloura.shop@gmail.com">aloura.shop@gmail.com</a><br/>
    Website: <a href="https://joinaloura.com">joinaloura.com</a></p>
  </div>
</div>

<style>
  .legal { padding: calc(var(--nav-h) + var(--space-8)) var(--page-px) var(--space-16); }
  .legal__inner { max-width: 760px; margin: 0 auto; }
  .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--clr-terracotta); margin-bottom: 6px; }
  .legal__title { font-family: var(--font-display); font-size: clamp(28px, 5vw, 38px); font-weight: 500; color: var(--clr-charcoal); margin-bottom: 6px; }
  .legal__date { font-size: 13px; color: var(--clr-taupe); margin-bottom: var(--space-8); }
  h2 { font-family: var(--font-display); font-size: 20px; font-weight: 500; color: var(--clr-charcoal); margin: var(--space-8) 0 var(--space-2); }
  p { font-size: 15px; font-weight: 300; line-height: 1.7; color: var(--clr-charcoal); margin-bottom: var(--space-3); }
  ul { margin: 0 0 var(--space-3); padding-left: 22px; }
  li { font-size: 15px; font-weight: 300; line-height: 1.6; color: var(--clr-charcoal); margin-bottom: 6px; }
  a { color: var(--clr-brown); font-weight: 500; }
</style>
