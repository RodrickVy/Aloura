<script lang="ts">
  import { page } from '$app/stores';
</script>

<svelte:head>
  <title>Privacy Policy - Aloura</title>
  <meta name="description" content="Aloura Privacy Policy." />
  <link rel="canonical" href="{$page.url.origin}/privacy" />
</svelte:head>

<div class="legal">
  <div class="legal__inner">
    <p class="eyebrow">Legal</p>
    <h1 class="legal__title">Privacy Policy</h1>
    <p class="legal__date">Effective Date: May 23, 2026</p>

    <h2>1. Introduction</h2>
    <p>Aloura respects your privacy and is committed to protecting your personal information. This Privacy Policy explains how we collect, use, process, disclose, and safeguard information when you use our Platform.</p>

    <h2>2. Information We Collect</h2>
    <h3>a. Information You Provide</h3>
    <ul>
      <li>Name, username, and email address</li>
      <li>Profile photos and uploaded images</li>
      <li>Style preferences and saved outfits</li>
      <li>Messages, feedback, and support inquiries</li>
    </ul>
    <h3>b. Automatically Collected Information</h3>
    <ul>
      <li>Device type and browser information</li>
      <li>IP address and approximate location</li>
      <li>Usage activity and engagement analytics</li>
      <li>Cookies and tracking technologies</li>
    </ul>
    <h3>c. AI &amp; Image Processing Data</h3>
    <ul>
      <li>Uploaded fashion inspiration images</li>
      <li>Selfies or body-related images voluntarily submitted</li>
      <li>Generated style analysis and personalization outputs</li>
    </ul>

    <h2>3. How We Use Information</h2>
    <p>We use collected information to:</p>
    <ul>
      <li>Provide personalized fashion recommendations</li>
      <li>Generate AI-driven style insights and mood boards</li>
      <li>Improve product functionality and recommendation quality</li>
      <li>Maintain platform security and prevent abuse</li>
      <li>Analyze trends, engagement, and user behavior</li>
      <li>Communicate updates, support, and service notices</li>
    </ul>

    <h2>4. AI Processing &amp; Uploaded Images</h2>
    <p>Uploaded photos and fashion-related images may be processed using artificial intelligence and machine learning systems to generate personalized outputs and improve platform performance.</p>
    <p>By uploading images, you acknowledge and consent to automated processing for style analysis, personalization, recommendation generation, and AI training/improvement purposes where permitted by law.</p>
    <p>We do not intentionally use uploaded images for facial recognition identification purposes.</p>

    <h2>5. Cookies &amp; Tracking Technologies</h2>
    <p>We use cookies, analytics tools, and similar technologies to improve functionality, remember preferences, measure engagement, and personalize experiences.</p>
    <p>You may disable cookies through your browser settings, though some features may not function properly.</p>

    <h2>6. Sharing of Information</h2>
    <p>We may share information with:</p>
    <ul>
      <li>Cloud hosting and infrastructure providers</li>
      <li>Analytics and performance partners</li>
      <li>AI processing and machine learning service providers</li>
      <li>Payment processors and commerce integrations</li>
      <li>Legal authorities when required by law</li>
    </ul>
    <p>We do not sell personal information in exchange for direct monetary compensation.</p>

    <h2>7. Data Retention</h2>
    <p>We retain information only as long as reasonably necessary for operational, legal, security, and business purposes.</p>
    <p>Users may request deletion of their accounts and associated personal information, subject to applicable legal obligations.</p>

    <h2>8. Security</h2>
    <p>We implement commercially reasonable technical, administrative, and organizational safeguards to protect user data.</p>
    <p>However, no method of electronic storage or transmission is completely secure, and we cannot guarantee absolute security.</p>

    <h2>9. International Users</h2>
    <p>Your information may be processed and stored in countries outside your jurisdiction where privacy laws may differ.</p>
    <p>By using the Platform, you consent to such transfers where legally permitted.</p>

    <h2>10. Your Rights</h2>
    <p>Depending on your jurisdiction, you may have rights to:</p>
    <ul>
      <li>Access personal information</li>
      <li>Correct inaccurate information</li>
      <li>Request deletion of data</li>
      <li>Withdraw consent</li>
      <li>Object to certain processing activities</li>
      <li>Request portability of personal data</li>
    </ul>
    <p>Requests may be submitted through the contact information below.</p>

    <h2>11. Changes to This Privacy Policy</h2>
    <p>We may modify this Privacy Policy periodically. Updated versions will be posted on this page with revised effective dates.</p>

    <h2>12. Contact Us</h2>
    <p>If you have questions regarding this Privacy Policy or your data rights, contact:</p>
    <p>Aloura Privacy Team<br/>
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
  h3 { font-size: 15px; font-weight: 600; color: var(--clr-brown); margin: var(--space-4) 0 var(--space-1); }
  p { font-size: 15px; font-weight: 300; line-height: 1.7; color: var(--clr-charcoal); margin-bottom: var(--space-3); }
  ul { margin: 0 0 var(--space-3); padding-left: 22px; }
  li { font-size: 15px; font-weight: 300; line-height: 1.6; color: var(--clr-charcoal); margin-bottom: 6px; }
  a { color: var(--clr-brown); font-weight: 500; }
</style>
