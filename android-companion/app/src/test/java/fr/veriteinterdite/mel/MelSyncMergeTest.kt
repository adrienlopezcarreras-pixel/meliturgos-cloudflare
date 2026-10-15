package fr.veriteinterdite.mel

import org.junit.Assert.assertEquals
import org.junit.Test

class MelSyncMergeTest {
    @Test fun redeliveryOfSameServerMessageDoesNotDuplicate() {
        val existing = listOf(MelChatMessage("mel", "bonjour", serverId = "m1"))
        val incoming = listOf(MelChatMessage("mel", "bonjour", serverId = "m1"))
        assertEquals(existing, mergeSyncedMessages(existing, incoming))
    }

    @Test fun distinctRepeatedUtterancesAreNeverCollapsedByText() {
        val existing = listOf(MelChatMessage("user", "oui", serverId = "m1"))
        val incoming = listOf(MelChatMessage("user", "oui", serverId = "m2"))
        assertEquals(2, mergeSyncedMessages(existing, incoming).size)
    }

    @Test fun duplicateIdsWithinOnePageAreIdempotentAndLocalMessagesSurvive() {
        val local = MelChatMessage("user", "question locale")
        val incoming = listOf(
            MelChatMessage("mel", "réponse", serverId = "m1"),
            MelChatMessage("mel", "réponse", serverId = "m1"),
            MelChatMessage("mel", "suite", serverId = "m2")
        )
        val merged = mergeSyncedMessages(listOf(local), incoming)
        assertEquals(3, merged.size)
        assertEquals(local, merged[0])
        assertEquals(listOf("m1", "m2"), merged.drop(1).map { it.serverId })
    }

    @Test fun missingServerIdCannotBecomeFalseDeduplicationKey() {
        val existing = listOf(MelChatMessage("mel", "texte précédent"))
        val incoming = listOf(MelChatMessage("mel", "texte sans identifiant"))
        assertEquals(existing, mergeSyncedMessages(existing, incoming))
    }
}
