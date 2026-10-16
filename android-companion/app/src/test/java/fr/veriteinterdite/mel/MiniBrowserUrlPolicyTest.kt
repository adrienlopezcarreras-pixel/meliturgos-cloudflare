package fr.veriteinterdite.mel

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MiniBrowserUrlPolicyTest {
    @Test fun acceptsNormalPublicWebAddresses() {
        assertTrue(MiniBrowserUrlPolicy.allows("https://www.example.org/path?x=1"))
        assertTrue(MiniBrowserUrlPolicy.allows("http://example.com:8080/image"))
        assertTrue(MiniBrowserUrlPolicy.allows("https://xn--bcher-kva.example/"))
    }

    @Test fun rejectsLocalAddressesAndNumericLoopbackAliases() {
        for (url in listOf(
            "http://localhost:8080/",
            "http://localhost./",
            "http://printer.local/",
            "http://app.internal/",
            "http://router.home.arpa/",
            "http://127.0.0.1/",
            "http://192.168.1.1/",
            "http://2130706433/",
            "http://0x7f000001/",
            "http://127.1/",
            "http://[::1]/",
            "http://[fe80::1]/"
        )) assertFalse("Allowed private URL: $url", MiniBrowserUrlPolicy.allows(url))
    }

    @Test fun rejectsMalformedSchemesUserInfoAndPrivateProviders() {
        for (url in listOf(
            "file:///data/data/secret",
            "content://settings/system",
            "javascript:alert(1)",
            "data:text/html,hello",
            "https://user:pass@example.org/",
            "https://example.org@localhost/",
            "http:///missing-host",
            "https://example..org",
            "https://example.org:0/"
        )) assertFalse("Allowed malformed URL: $url", MiniBrowserUrlPolicy.allows(url))
    }
}
