// تهيئة مكتبة Lucide للأيقونات
lucide.createIcons();

// تهيئة AOS للحركات
AOS.init({
    duration: 800,
    easing: 'ease-out-cubic',
    once: true,
    offset: 100,
});

// إدارة قائمة التنقل على الجوال
const navToggle = document.querySelector('.nav__toggle');
const navMenu = document.querySelector('.nav__menu');
const navActions = document.querySelector('.nav__actions');

if (navToggle) {
    navToggle.addEventListener('click', () => {
        const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
        
        navToggle.setAttribute('aria-expanded', !isExpanded);
        
        if (navMenu) {
            navMenu.style.display = isExpanded ? 'none' : 'flex';
        }
        
        if (navActions) {
            navActions.style.display = isExpanded ? 'none' : 'flex';
        }
        
        // تغيير الأيقونة
        const icon = navToggle.querySelector('i');
        if (icon) {
            if (isExpanded) {
                icon.setAttribute('data-lucide', 'menu');
            } else {
                icon.setAttribute('data-lucide', 'x');
            }
            lucide.createIcons();
        }
    });
}

// إغلاق القائمة عند النقر على رابط
const navLinks = document.querySelectorAll('.nav__menu a');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        if (window.innerWidth < 768) {
            navToggle.setAttribute('aria-expanded', 'false');
            if (navMenu) navMenu.style.display = 'none';
            if (navActions) navActions.style.display = 'none';
            
            const icon = navToggle.querySelector('i');
            if (icon) {
                icon.setAttribute('data-lucide', 'menu');
                lucide.createIcons();
            }
        }
    });
});

// إدارة نموذج الاشتراك
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const emailInput = signupForm.querySelector('input[type="email"]');
        const email = emailInput.value.trim();
        
        if (!email) {
            showNotification('يرجى إدخال بريد إلكتروني صحيح', 'error');
            return;
        }
        
        if (!isValidEmail(email)) {
            showNotification('صيغة البريد الإلكتروني غير صحيحة', 'error');
            return;
        }
        
        // محاكاة إرسال النموذج
        showNotification('جاري إرسال طلبك...', 'loading');
        
        setTimeout(() => {
            showNotification('تم إرسال طلبك بنجاح! ستصلك رسالة التأكيد قريباً', 'success');
            signupForm.reset();
        }, 2000);
    });
}

// التحقق من صحة البريد الإلكتروني
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// عرض الإشعارات
function showNotification(message, type = 'info') {
    // إنشاء عنصر الإشعار
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.innerHTML = `
        <div class="notification__content">
            <i data-lucide="${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // إضافة الأنماط
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            top: 20px;
            left: 20px;
            right: 20px;
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            padding: var(--space-4);
            box-shadow: var(--shadow-lg);
            z-index: 9999;
            animation: slideIn 0.3s ease;
            max-width: 400px;
            margin: 0 auto;
        }
        
        .notification--success {
            border-color: var(--color-success);
            background: var(--color-success);
            color: white;
        }
        
        .notification--error {
            border-color: var(--color-danger);
            background: var(--color-danger);
            color: white;
        }
        
        .notification--loading {
            border-color: var(--color-primary);
            background: var(--color-primary);
            color: white;
        }
        
        .notification__content {
            display: flex;
            align-items: center;
            gap: var(--space-3);
        }
        
        .notification__content i {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
        }
        
        @keyframes slideIn {
            from {
                transform: translateY(-100%);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
        
        @media (min-width: 768px) {
            .notification {
                left: auto;
                right: 20px;
            }
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(notification);
    
    // تحديث الأيقونات
    lucide.createIcons();
    
    // إزالة الإشعار تلقائياً بعد 5 ثوان
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 300);
    }, 5000);
}

// الحصول على الأيقونة المناسبة لنوع الإشعار
function getNotificationIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'alert-circle',
        loading: 'loader',
        info: 'info'
    };
    return icons[type] || 'info';
}

// تحسين تجربة التمرير
function initSmoothScrolling() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (!target) return;
            
            e.preventDefault();
            
            const offsetTop = target.offsetTop - 80; // تعويض للهيدر الثابت
            
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        });
    });
}

// تهيئة التمرير السلس
initSmoothScrolling();

// تحسين الأداء عند التحميل
document.addEventListener('DOMContentLoaded', () => {
    // تحميل الصور بكسلانية
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
        if (img.complete) {
            img.classList.add('loaded');
        } else {
            img.addEventListener('load', () => {
                img.classList.add('loaded');
            });
        }
    });
});

// إضافة أنماط للأداء
const performanceStyles = document.createElement('style');
performanceStyles.textContent = `
    img[loading="lazy"] {
        opacity: 0;
        transition: opacity 0.3s ease;
    }
    
    img[loading="lazy"].loaded {
        opacity: 1;
    }
    
    /* تحسين FOIT للخطوط */
    .wf-loading {
        visibility: hidden;
    }
    
    .wf-active {
        visibility: visible;
    }
`;

document.head.appendChild(performanceStyles);

// إدارة حالة التحميل
window.addEventListener('load', () => {
    document.documentElement.classList.add('loaded');
});