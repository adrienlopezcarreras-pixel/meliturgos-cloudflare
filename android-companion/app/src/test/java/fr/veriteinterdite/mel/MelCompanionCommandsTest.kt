package fr.veriteinterdite.mel

import org.junit.Assert.*
import org.junit.Test
import java.util.Date

class MelCompanionCommandsTest {
    @Test
    fun arithmeticIsLocal() {
        val result = MelCompanionCommands.parse("combien font 12 fois 8")
        assertTrue(result is MelCompanionCommand.Reply)
        assertTrue((result as MelCompanionCommand.Reply).text.contains("96"))
    }

    @Test
    fun conversionIsLocal() {
        val result = MelCompanionCommands.parse("convertis 1 km en m")
        assertTrue(result is MelCompanionCommand.Reply)
        assertTrue((result as MelCompanionCommand.Reply).text.contains("1000"))
    }

    @Test
    fun timeAndDateAreLocal() {
        assertTrue(MelCompanionCommands.parse("quelle heure est-il ?", Date(0)) is MelCompanionCommand.Reply)
        assertTrue(MelCompanionCommands.parse("quelle date sommes-nous ?", Date(0)) is MelCompanionCommand.Reply)
    }

    @Test
    fun timerAndRelativeReminderAreLocal() {
        val timer = MelCompanionCommands.parse("mets un minuteur de 5 minutes")
        assertEquals(300, (timer as MelCompanionCommand.SetTimer).seconds)

        val reminder = MelCompanionCommands.parse("rappelle-moi dans 10 minutes de sortir le gâteau")
        assertEquals(600, (reminder as MelCompanionCommand.SetTimer).seconds)
        assertTrue(reminder.label.contains("sortir le gâteau"))
    }

    @Test
    fun alarmIsLocal() {
        val alarm = MelCompanionCommands.parse("réveille-moi à 7h30")
        assertTrue(alarm is MelCompanionCommand.SetAlarm)
        alarm as MelCompanionCommand.SetAlarm
        assertEquals(7, alarm.hour)
        assertEquals(30, alarm.minute)
    }

    @Test
    fun communicationActionsRequireAndroidHandoff() {
        assertTrue(MelCompanionCommands.parse("appelle le 0612345678") is MelCompanionCommand.Dial)
        assertTrue(MelCompanionCommands.parse("envoie un sms au 0612345678 disant bonjour") is MelCompanionCommand.Sms)
        assertTrue(MelCompanionCommands.parse("prépare un mail à test@example.com disant bonjour") is MelCompanionCommand.Email)
        assertTrue(MelCompanionCommands.parse("ouvre le téléphone") is MelCompanionCommand.OpenDialer)
    }

    @Test
    fun navigationAndSettingsAreLocal() {
        assertTrue(MelCompanionCommands.parse("emmène-moi à la gare de Nîmes") is MelCompanionCommand.Navigate)
        assertTrue(MelCompanionCommands.parse("ouvre les réglages wifi") is MelCompanionCommand.WifiSettings)
        assertTrue(MelCompanionCommands.parse("ouvre les réglages bluetooth") is MelCompanionCommand.BluetoothSettings)
        assertTrue(MelCompanionCommands.parse("ouvre les réglages de localisation") is MelCompanionCommand.LocationSettings)
        assertTrue(MelCompanionCommands.parse("ouvre les réglages du son") is MelCompanionCommand.SoundSettings)
    }

    @Test
    fun standardAppsAndDeviceStatusAreLocal() {
        val calculator = MelCompanionCommands.parse("ouvre la calculatrice")
        assertTrue(calculator is MelCompanionCommand.OpenApp)
        assertEquals(MelAppTarget.CALCULATOR, (calculator as MelCompanionCommand.OpenApp).target)

        assertTrue(MelCompanionCommands.parse("quel est le niveau de batterie") is MelCompanionCommand.BatteryStatus)
        assertTrue(MelCompanionCommands.parse("est-ce que j'ai internet") is MelCompanionCommand.InternetStatus)
        assertTrue(MelCompanionCommands.parse("quel est le volume actuel") is MelCompanionCommand.VolumeStatus)
    }

    @Test
    fun cameraFilesAndNotificationsAreLocal() {
        assertTrue(MelCompanionCommands.parse("prends une photo") is MelCompanionCommand.Camera)
        assertTrue(MelCompanionCommands.parse("ouvre un fichier") is MelCompanionCommand.FilePicker)
        assertTrue(MelCompanionCommands.parse("active les notifications") is MelCompanionCommand.EnableNotifications)
    }

    @Test
    fun calendarEventIsPreparedLocally() {
        val event = MelCompanionCommands.parse(
            "ajoute un rendez-vous chez le dentiste à mon agenda demain à 14h",
            Date(0)
        )
        assertTrue(event is MelCompanionCommand.CalendarEvent)
        event as MelCompanionCommand.CalendarEvent
        assertTrue(event.title.contains("dentiste"))
        assertTrue(event.endMillis > event.beginMillis)
    }

    @Test
    fun shoppingListCommandsAreLocal() {
        val add = MelCompanionCommands.parse("ajoute du lait à ma liste de courses")
        assertTrue(add is MelCompanionCommand.AddShoppingItem)
        assertEquals("du lait", (add as MelCompanionCommand.AddShoppingItem).item)
        assertTrue(MelCompanionCommands.parse("lis ma liste de courses") is MelCompanionCommand.ShowShoppingList)
        assertTrue(MelCompanionCommands.parse("vide ma liste de courses") is MelCompanionCommand.ClearShoppingList)
    }

    @Test
    fun notesCommandsAreLocal() {
        val add = MelCompanionCommands.parse("note que le colis arrive vendredi")
        assertTrue(add is MelCompanionCommand.AddNote)
        assertTrue((add as MelCompanionCommand.AddNote).note.contains("colis"))
        assertTrue(MelCompanionCommands.parse("lis mes notes") is MelCompanionCommand.ShowNotes)
        assertTrue(MelCompanionCommands.parse("efface mes notes") is MelCompanionCommand.ClearNotes)
    }

    @Test
    fun unknownRequestFallsBackToMel() {
        assertNull(MelCompanionCommands.parse("explique-moi la relativité générale"))
    }
}
