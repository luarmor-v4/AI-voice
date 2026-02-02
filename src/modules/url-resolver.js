const fetch = require('node-fetch');
const cheerio = require('cheerio');

/**
 * URL Resolver - Membaca berbagai platform yang sulit
 */

// ==================== TWITTER/X ====================
async function resolveTwitter(url) {
    try {
        // Ganti twitter.com/x.com dengan fxtwitter.com (embed friendly)
        let fxUrl = url
            .replace('twitter.com', 'api.fxtwitter.com')
            .replace('x.com', 'api.fxtwitter.com');
        
        const response = await fetch(fxUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const tweet = data.tweet;
        
        if (!tweet) throw new Error('Tweet not found');
        
        let content = `🐦 **Tweet dari @${tweet.author?.screen_name || 'unknown'}**\n\n`;
        content += `${tweet.text || ''}\n\n`;
        
        if (tweet.media?.photos?.length) {
            content += `📷 ${tweet.media.photos.length} foto\n`;
        }
        if (tweet.media?.videos?.length) {
            content += `🎬 ${tweet.media.videos.length} video\n`;
        }
        
        content += `❤️ ${tweet.likes || 0} | 🔁 ${tweet.retweets || 0} | 💬 ${tweet.replies || 0}`;
        
        return {
            success: true,
            type: 'twitter',
            content: content
        };
        
    } catch (error) {
        console.error('Twitter resolver error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==================== TIKTOK ====================
async function resolveTikTok(url) {
    try {
        // Extract video ID
        const videoId = url.match(/video\/(\d+)/)?.[1] || 
                        url.match(/tiktok\.com\/@[\w.]+\/video\/(\d+)/)?.[1];
        
        // Pakai tikwm.com API (gratis)
        const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
        
        const response = await fetch(apiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (data.code !== 0 || !data.data) {
            throw new Error('Video not found');
        }
        
        const video = data.data;
        
        let content = `🎵 **TikTok dari @${video.author?.unique_id || 'unknown'}**\n\n`;
        content += `${video.title || ''}\n\n`;
        content += `❤️ ${formatNumber(video.digg_count)} | 💬 ${formatNumber(video.comment_count)} | 🔗 ${formatNumber(video.share_count)}\n`;
        content += `▶️ ${formatNumber(video.play_count)} views\n`;
        
        if (video.music_info?.title) {
            content += `🎶 ${video.music_info.title}`;
        }
        
        return {
            success: true,
            type: 'tiktok',
            content: content,
            videoUrl: video.play // URL video tanpa watermark
        };
        
    } catch (error) {
        console.error('TikTok resolver error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==================== INSTAGRAM ====================
async function resolveInstagram(url) {
    try {
        // Extract shortcode
        const shortcode = url.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/)?.[2];
        
        if (!shortcode) throw new Error('Invalid Instagram URL');
        
        // Pakai imginn.com untuk bypass
        const apiUrl = `https://imginn.com/p/${shortcode}/`;
        
        const response = await fetch(apiUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const username = $('.username').text().trim() || 'unknown';
        const caption = $('.desc').text().trim() || '';
        const likes = $('.likes').text().trim() || '0';
        const comments = $('.comments').text().trim() || '0';
        
        let content = `📸 **Instagram dari @${username}**\n\n`;
        content += `${caption.slice(0, 1000)}\n\n`;
        content += `❤️ ${likes} | 💬 ${comments}`;
        
        return {
            success: true,
            type: 'instagram',
            content: content
        };
        
    } catch (error) {
        console.error('Instagram resolver error:', error.message);
        
        // Fallback message
        return { 
            success: false, 
            error: 'Instagram membutuhkan login. Copy-paste caption secara manual.',
            type: 'instagram'
        };
    }
}

// ==================== LINK SHORTENER ====================
async function resolveShortener(url) {
    try {
        // Follow semua redirect
        const response = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            redirect: 'follow',
            follow: 20,
            timeout: 15000
        });
        
        // Dapatkan URL final setelah redirect
        const finalUrl = response.url;
        
        if (finalUrl === url) {
            // Tidak ada redirect, coba parse dari HTML
            const html = await response.text();
            const $ = cheerio.load(html);
            
            // Cari meta refresh atau JS redirect
            const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
            if (metaRefresh) {
                const match = metaRefresh.match(/url=(.+)/i);
                if (match) return { success: true, finalUrl: match[1].trim() };
            }
            
            // Cari link di page
            const links = $('a[href^="http"]').map((i, el) => $(el).attr('href')).get();
            if (links.length > 0) {
                return { success: true, finalUrl: links[0], allLinks: links };
            }
        }
        
        return {
            success: true,
            finalUrl: finalUrl,
            type: 'shortener'
        };
        
    } catch (error) {
        console.error('Shortener resolver error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==================== LINKVERTISE/LOOTLABS BYPASS ====================
async function resolveLinkvertise(url) {
    try {
        // Pakai bypass API gratis
        const bypassApis = [
            `https://api.bypass.vip/bypass?url=${encodeURIComponent(url)}`,
            `https://api.crackedmc.eu/bypass/?url=${encodeURIComponent(url)}`,
        ];
        
        for (const apiUrl of bypassApis) {
            try {
                const response = await fetch(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.result || data.destination || data.bypassed) {
                        return {
                            success: true,
                            finalUrl: data.result || data.destination || data.bypassed,
                            type: 'linkvertise'
                        };
                    }
                }
            } catch (e) {
                continue; // Coba API berikutnya
            }
        }
        
        throw new Error('Semua bypass API gagal');
        
    } catch (error) {
        console.error('Linkvertise resolver error:', error.message);
        return { 
            success: false, 
            error: 'Tidak bisa bypass. Coba buka manual di browser.',
            type: 'linkvertise'
        };
    }
}

// ==================== MAIN RESOLVER ====================
async function resolveURL(url) {
    const urlLower = url.toLowerCase();
    
    // Detect platform
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
        return await resolveTwitter(url);
    }
    
    if (urlLower.includes('tiktok.com')) {
        return await resolveTikTok(url);
    }
    
    if (urlLower.includes('instagram.com')) {
        return await resolveInstagram(url);
    }
    
    if (urlLower.includes('linkvertise.com') || 
        urlLower.includes('link-to.net') ||
        urlLower.includes('direct-link.net')) {
        return await resolveLinkvertise(url);
    }
    
    if (urlLower.includes('lootlabs.gg') || 
        urlLower.includes('lootlink.org') ||
        urlLower.includes('loot-link.com')) {
        return await resolveLinkvertise(url); // Same bypass method
    }
    
    // Link shorteners
    const shorteners = [
        'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly',
        'is.gd', 'buff.ly', 'adf.ly', 'shorte.st', 'bc.vc',
        'j.gs', 'q.gs', 'ouo.io', 'ouo.press', 'exe.io',
        'gplinks.co', 'shrinkme.io', 'za.gl', 'shorturl.at'
    ];
    
    if (shorteners.some(s => urlLower.includes(s))) {
        return await resolveShortener(url);
    }
    
    // Default: return null (gunakan fetch biasa)
    return null;
}

// Helper function
function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

module.exports = {
    resolveURL,
    resolveTwitter,
    resolveTikTok,
    resolveInstagram,
    resolveShortener,
    resolveLinkvertise
};
