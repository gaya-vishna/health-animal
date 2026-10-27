package app.healthanimal.family;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        createChannels();
        super.onCreate(savedInstanceState);
        // Respect the system font-size setting (people who need larger text get it), but cap it at 150%
        // so the pixel layout does not break, and never go below 100%.
        int fontScalePercent = Math.round(getResources().getConfiguration().fontScale * 100);
        getBridge().getWebView().getSettings().setTextZoom(Math.max(100, Math.min(150, fontScalePercent)));
    }

    // Channel sound/vibration are frozen once a channel is created. To change them, bump the _v1
    // suffix in both these ids and client/src/utils/reminders.js. The old 'reminders' channel is
    // deliberately left alone (JS deletes it).
    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        addChannel(manager, "ha_meal_v1", "Meal reminders", R.raw.sloth_meal,
                new long[] {0, 120, 80, 120, 80, 300});
        addChannel(manager, "ha_bedtime_v1", "Bedtime reminders", R.raw.sloth_bedtime,
                new long[] {0, 600, 400, 600});
        addChannel(manager, "ha_water_v1", "Water reminders", R.raw.sloth_water,
                new long[] {0, 60, 60, 60, 60, 60});
        addChannel(manager, "ha_hello_v1", "Test reminder", R.raw.sloth_hello,
                new long[] {0, 100, 100, 200, 100, 400});
    }

    private void addChannel(NotificationManager manager, String id, String name, int soundRes, long[] vibration) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(Uri.parse("android.resource://" + getPackageName() + "/" + soundRes), attrs);
        channel.enableVibration(true);
        channel.setVibrationPattern(vibration);
        channel.enableLights(true);
        channel.setLightColor(0xFFE0A526);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }
}
