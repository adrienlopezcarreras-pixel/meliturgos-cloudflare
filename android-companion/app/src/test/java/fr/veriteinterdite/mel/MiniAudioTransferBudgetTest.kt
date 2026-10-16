package fr.veriteinterdite.mel

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MiniAudioTransferBudgetTest {
    @Test fun rejectsInvalidAndOversizedAudioBlocksBeforeWriting() {
        val budget = MiniAudioTransferBudget()
        assertFalse(budget.reserve(0))
        assertFalse(budget.reserve(-1))
        assertFalse(budget.reserve(Int.MAX_VALUE))
        assertFalse(budget.reserve(MiniAudioTransferBudget.MAX_CHUNK_BYTES + 1))
        assertTrue(budget.reserve(MiniAudioTransferBudget.MAX_CHUNK_BYTES))
    }

    @Test fun refusesAnythingBeyondTotalAudioByteBudget() {
        val budget = MiniAudioTransferBudget()
        val max = MiniAudioTransferBudget.MAX_CHUNK_BYTES
        repeat((MiniAudioTransferBudget.MAX_PCM_BYTES / max).toInt()) {
            assertTrue(budget.reserve(max))
        }
        val remaining = (MiniAudioTransferBudget.MAX_PCM_BYTES % max).toInt()
        assertTrue(budget.reserve(remaining))
        assertFalse(budget.reserve(1))
    }

    @Test fun slowAudioSenderCannotKeepRecordingBeyondThreeMinutes() {
        var now = 2_000_000_000L
        val budget = MiniAudioTransferBudget { now }
        assertTrue(budget.reserve(1))
        now += MiniAudioTransferBudget.MAX_DURATION_NANOS - 1
        assertTrue(budget.withinDeadline())
        assertTrue(budget.reserve(1))
        now += 1
        assertFalse(budget.withinDeadline())
        assertFalse(budget.reserve(1))
    }
}
