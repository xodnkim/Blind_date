/**
 * Blind Date - Main JavaScript (Supabase Version)
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Blind Date initialized with Supabase.");
    
    const db = window.supabaseClient;
    if (!db) {
        console.warn("Supabase client not found. DB operations will fail, but hardcoded admin might work.");
    }

    // --- 비밀번호 SHA-256 해싱 함수 ---
    const hashPassword = async (password) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // --- 에러 로그 기록 함수 ---
    const logError = async (message, userId = 'guest') => {
        if (!db) return;
        try {
            await db.from('error_logs').insert([{
                user_id: userId,
                page_url: window.location.href,
                error_message: message,
                browser_info: navigator.userAgent
            }]);
        } catch (e) {
            console.error("Critical: Failed to log error to DB", e);
        }
    };

    // --- XSS 방지: HTML 이스케이프 함수 ---
    const escapeHtml = (str) =>
        String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

    // --- 텔레그램 알림 전송 함수 (서버리스 함수 경유, 비밀 키 헤더 포함) ---
    const NOTIFY_SECRET = 'bd_notify_2026_s3cr3t_k3y';
    const sendTelegramMessage = async (message) => {
        try {
            await fetch('/api/notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': NOTIFY_SECRET
                },
                body: JSON.stringify({ message })
            });
        } catch (e) {
            console.error("Telegram Notification Failed:", e);
        }
    };


    // --- 커스텀 모달 (Feature 3) ---
    const showCustomModal = ({ title, desc, placeholder, confirmText, cancelText }) => {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.display = 'flex';
            
            overlay.innerHTML = `
                <div class="modal-content">
                    <div class="modal-title"><i class="ph-fill ph-chat-circle-dots"></i> ${title}</div>
                    <div class="modal-desc">${desc}</div>
                    <input type="text" class="modal-input" placeholder="${placeholder}" id="modalInput">
                    <div class="modal-actions">
                        <button class="btn-action secondary" id="modalCancel" style="flex: 1;">${cancelText}</button>
                        <button class="btn-action" id="modalConfirm" style="flex: 1;">${confirmText}</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            const input = overlay.querySelector('#modalInput');
            input.focus();

            const close = (val) => {
                overlay.style.opacity = '0';
                setTimeout(() => {
                    if (document.body.contains(overlay)) {
                        document.body.removeChild(overlay);
                    }
                    resolve(val);
                }, 300);
            };

            overlay.querySelector('#modalConfirm').onclick = () => close(input.value.trim());
            overlay.querySelector('#modalCancel').onclick = () => close(null);
            overlay.onclick = (e) => { if (e.target === overlay) close(null); };
            input.onkeypress = (e) => { if (e.key === 'Enter') close(input.value.trim()); };
        });
    };

    // --- 브루트포스 방어: 로그인 실패 횟수 추적 ---
    const LOGIN_MAX_ATTEMPTS = 5;
    const LOGIN_LOCK_DURATION = 3 * 60 * 1000; // 3분 잠금

    const getLoginAttempts = () => {
        const data = JSON.parse(sessionStorage.getItem('loginAttempts') || '{}');
        if (data.lockUntil && Date.now() < data.lockUntil) {
            return data;
        }
        if (data.lockUntil && Date.now() >= data.lockUntil) {
            sessionStorage.removeItem('loginAttempts');
            return { count: 0 };
        }
        return data;
    };

    const recordLoginFailure = () => {
        const data = getLoginAttempts();
        data.count = (data.count || 0) + 1;
        if (data.count >= LOGIN_MAX_ATTEMPTS) {
            data.lockUntil = Date.now() + LOGIN_LOCK_DURATION;
        }
        sessionStorage.setItem('loginAttempts', JSON.stringify(data));
        return data;
    };

    // --- Login Handler ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 브루트포스 체크
            const attempts = getLoginAttempts();
            if (attempts.lockUntil && Date.now() < attempts.lockUntil) {
                const remainSec = Math.ceil((attempts.lockUntil - Date.now()) / 1000);
                alert(`로그인 시도가 ${LOGIN_MAX_ATTEMPTS}회 초과되었습니다.\n${remainSec}초 후에 다시 시도해주세요.`);
                return;
            }

            const idInput = document.getElementById('username').value;
            const pwInput = document.getElementById('password').value;

            // DB 인증 (관리자 포함 모두 DB로 처리)
            if (!db) {
                alert('데이터베이스 연결이 설정되지 않았습니다.');
                return;
            }

            // 비밀번호 해시 비교
            const hashedPw = await hashPassword(pwInput);

            const { data: user, error } = await db
                .from('users')
                .select('*')
                .eq('id', idInput)
                .eq('password', hashedPw)
                .single();

            if (error || !user) {
                const failData = recordLoginFailure();
                const remaining = LOGIN_MAX_ATTEMPTS - failData.count;
                if (remaining > 0) {
                    alert(`아이디 또는 비밀번호가 올바르지 않습니다. (남은 시도: ${remaining}회)`);
                } else {
                    alert(`로그인 시도가 ${LOGIN_MAX_ATTEMPTS}회 초과되었습니다.\n3분 후에 다시 시도해주세요.`);
                }
                return;
            }

            // 로그인 성공 시 실패 카운터 초기화
            sessionStorage.removeItem('loginAttempts');

            if (user.status === 'pending') {
                alert('아직 승인 대기 중입니다. 지인 확인 후 승인해 드릴게요!');
                return;
            }

            const rememberMe = document.getElementById('rememberMe')?.checked;
            alert(`${user.name}님, 환영합니다!`);
            
            // 비밀번호를 세션에 저장하지 않음 (보안)
            const safeUser = { ...user };
            delete safeUser.password;
            const userData = JSON.stringify(safeUser);
            if (rememberMe) {
                localStorage.setItem('currentUser', userData);
            } else {
                sessionStorage.setItem('currentUser', userData);
            }
            window.location.href = 'main.html';
        });
    }

    // --- Signup Handler ---
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        // 연락처 자동 하이픈 (000-0000-0000)
        const phoneInput = document.getElementById('signupPhone');
        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => {
                let val = e.target.value.replace(/[^0-9]/g, '');
                if (val.length > 11) val = val.substring(0, 11);
                
                if (val.length > 7) {
                    val = val.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
                } else if (val.length > 3) {
                    val = val.replace(/(\d{3})(\d{1,4})/, '$1-$2');
                }
                e.target.value = val;
            });
        }

        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('signupId').value;
            const password = document.getElementById('signupPassword').value;
            const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
            const name = document.getElementById('signupName').value;
            const phone = document.getElementById('signupPhone').value;
            const referrer = document.getElementById('signupReferrer').value;
            
            if (password !== passwordConfirm) {
                alert('비밀번호가 일치하지 않습니다. 다시 확인해주세요.');
                return;
            }
            if (!db) {
                alert('데이터베이스 연결이 설정되지 않았습니다.');
                return;
            }

            // Check if ID already exists
            const { data: existingUsers } = await db.from('users').select('id').eq('id', id);
            if (existingUsers && existingUsers.length > 0) {
                alert('이미 존재하는 아이디입니다.');
                return;
            }

            // 비밀번호 해싱 후 저장
            const hashedPassword = await hashPassword(password);

            // Insert new user
            const { error } = await db.from('users').insert([{
                id,
                password: hashedPassword,
                name,
                phone,
                referrer,
                role: 'user',
                status: 'pending',
                created_at: new Date().toISOString()
            }]);

            if (error) {
                if (error.code === '23505') {
                    alert('이미 존재하는 아이디입니다.');
                } else {
                    alert('회원가입 처리 중 오류가 발생했습니다: ' + error.message);
                }
            } else {
                // 텔레그램 알림 전송
                const msg = `🔔 <b>새로운 가입 신청!</b>\n\n` +
                            `아이디: ${id}\n` +
                            `이름: ${name}\n` +
                            `연락처: ${phone}\n` +
                            `추천인: ${referrer}\n\n` +
                            `관리자 페이지에서 승인을 진행해주세요!`;
                sendTelegramMessage(msg);

                alert(`${name}님, 회원가입 요청이 전송되었습니다.\n지인 확인 후 승인해 드릴 예정입니다.`);
                window.location.href = 'index.html';
            }
        });
    }

    const getSessionUser = () => {
        return JSON.parse(localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser'));
    };

    const logout = () => {
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    };

    // --- Main Dashboard Logic ---
    const isMainPage = window.location.pathname.includes('main.html');
    
    if (isMainPage) {
        const sessionUser = getSessionUser();
        
        // 1. Session Protection
        if (!sessionUser) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'index.html';
            return;
        }

        // 2. Update Welcome UI
        const welcomeNameEl = document.getElementById('welcomeName');
        if (welcomeNameEl) {
            // Include a crown icon if admin, otherwise just the name
            const icon = sessionUser.role === 'admin' ? '<i class="ph-fill ph-crown" style="color: #ffce00; margin-right: 4px;"></i>' : '';
            welcomeNameEl.innerHTML = icon + sessionUser.name + '님';
        }

        const adminMenuLink = document.getElementById('adminMenuLink');
        if (adminMenuLink && sessionUser.role === 'admin') {
            adminMenuLink.style.display = 'inline-block';
        }

        // 3. Logout Handler
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }

        // 4. Check Profile Status
        const checkProfileStatus = async () => {
            if (!db) return;
            const { data: profile } = await db.from('profiles').select('user_id').eq('user_id', sessionUser.id).single();
            
            const btnFindDate = document.getElementById('btnFindDate');

            if (profile) {
                // Enable Find Date button
                if (btnFindDate) {
                    btnFindDate.disabled = false;
                    btnFindDate.style.opacity = '1';
                    btnFindDate.style.cursor = 'pointer';
                }

                const title = document.getElementById('profileCardTitle');
                const desc = document.getElementById('profileCardDesc');
                const actionArea = document.getElementById('profileActionArea');
                
                if (title) title.innerText = '내 프로필 관리';
                if (desc) desc.innerText = '등록된 프로필을 확인하거나 수정할 수 있습니다.';

                // Update Main Dashboard Welcome Text
                const mainTitle = document.getElementById('mainTitle');
                const mainSubtitle = document.getElementById('mainSubtitle');
                if (mainTitle) mainTitle.innerHTML = '인연을 찾아보세요 <span class="title-accent">✨</span>';
                if (mainSubtitle) mainSubtitle.innerText = '나와 잘 어울리는 새로운 인연을 탐색할 시간입니다.';
                if (actionArea) {
                    actionArea.innerHTML = `
                        <button class="btn-action secondary" onclick="window.location.href='profile_view.html'" style="flex: 1; padding: 12px; font-size: 0.95rem;">프로필 확인</button>
                        <button class="btn-action" onclick="window.location.href='profile.html'" style="flex: 1; padding: 12px; font-size: 0.95rem;">프로필 수정</button>
                    `;
                }
            } else {
                // Disable Find Date button
                if (btnFindDate) {
                    btnFindDate.disabled = true;
                    btnFindDate.style.opacity = '0.5';
                    btnFindDate.style.cursor = 'not-allowed';
                    btnFindDate.onclick = (e) => {
                        e.preventDefault();
                        alert('프로필을 먼저 등록해야 인연 찾기가 가능합니다.');
                        return false;
                    };
                }
                // Disable Match Status button too
                const btnMatchStatus = document.getElementById('btnMatchStatus');
                if (btnMatchStatus) {
                    btnMatchStatus.disabled = true;
                    btnMatchStatus.style.opacity = '0.5';
                    btnMatchStatus.style.cursor = 'not-allowed';
                    btnMatchStatus.onclick = (e) => {
                        e.preventDefault();
                        alert('프로필을 먼저 등록해야 신청 관리가 가능합니다.');
                        return false;
                    };
                }
            }
        };
        checkProfileStatus();

        // 4.5 [추가] Today 프로필 조회수 로드
        const loadTodayViews = async () => {
            if (!db || !sessionUser) return;
            
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            
            // 오늘 내 프로필을 조회한 고유 사용자 수 가져오기
            const { data: views, error } = await db.from('profile_views')
                .select('viewer_id')
                .eq('target_id', sessionUser.id)
                .gte('viewed_at', todayStart.toISOString());
            
            if (error) return;
            
            // 고유 시청자 수 계산
            const uniqueViewers = new Set((views || []).map(v => v.viewer_id)).size;
            
            const countEl = document.getElementById('todayViewCount');
            const badge = document.getElementById('newViewBadge');
            const msg = document.getElementById('viewIncrMsg');
            
            if (countEl) countEl.innerText = uniqueViewers;
            
            // 하이라이트 로직 (localStorage 이용)
            const lastSeenCount = parseInt(localStorage.getItem(`lastSeenViews_${sessionUser.id}`) || '0');
            if (uniqueViewers > lastSeenCount) {
                if (badge) badge.style.display = 'block';
                if (msg) msg.style.visibility = 'visible';
            } else {
                if (badge) badge.style.display = 'none';
                if (msg) msg.style.visibility = 'hidden';
            }

            // 클릭 핸들러 (조회수 확인 처리)
            window.handleViewsClick = () => {
                localStorage.setItem(`lastSeenViews_${sessionUser.id}`, uniqueViewers);
                if (badge) badge.style.display = 'none';
                if (msg) msg.style.visibility = 'hidden';
                alert('오늘 내 프로필을 ' + uniqueViewers + '명이 조회했습니다!\n조회한 명단 공개 기능은 곧 업데이트될 예정입니다.');
            };
        };
        loadTodayViews();

        // 5. Check for Notifications (New match requests received)
        const checkNotifications = async () => {
            if (!db || !sessionUser) return;
            
            const lastViewed = localStorage.getItem(`lastViewedMatches_${sessionUser.id}`);
            
            // lastViewed가 없으면 (신청관리 미방문) → 받은 pending 요청이 있는지 직접 확인
            if (!lastViewed) {
                const { data: pendingReceived } = await db.from('matches')
                    .select('id')
                    .eq('to_user_id', sessionUser.id)
                    .eq('status', 'pending')
                    .limit(1);
                
                if (pendingReceived && pendingReceived.length > 0) {
                    const btnMatchStatus = document.getElementById('btnMatchStatus');
                    if (btnMatchStatus) {
                        btnMatchStatus.classList.add('btn-highlight');
                        btnMatchStatus.innerHTML = '<i class="ph-fill ph-bell-ringing"></i> 새로운 소식 있음';
                    }
                }
                return;
            }

            const lvTime = new Date(lastViewed);
            
            // Fetch all records where the user is involved and were created recently
            // This covers new requests and re-inserts for rejections/rematches
            const { data: news } = await db.from('matches')
                .select('*')
                .or(`to_user_id.eq.${sessionUser.id},from_user_id.eq.${sessionUser.id}`)
                .gt('created_at', lastViewed);
            
            if (news && news.length > 0) {
                const hasImportantNews = news.some(n => {
                    const cTime = new Date(n.created_at);
                    if (cTime <= lvTime) return false;

                    // 1. New request received TO me
                    if (n.to_user_id === sessionUser.id && n.status === 'pending') return true;
                    // 2. Sent request REJECTED BY them
                    if (n.from_user_id === sessionUser.id && n.status === 'rejected') return true;
                    // 3. New match (mutual pending)
                    return false; 
                });

                if (hasImportantNews) {
                    const btnMatchStatus = document.getElementById('btnMatchStatus');
                    if (btnMatchStatus) {
                        btnMatchStatus.classList.add('btn-highlight');
                        btnMatchStatus.innerHTML = '<i class="ph-fill ph-bell-ringing"></i> 새로운 소식 있음';
                    }
                }
            }
        };
        checkNotifications();

        // 5-1. Check for Likes Received (Feature 2)
        const checkLikes = async () => {
            if (!db || !sessionUser) return;
            const { data: recLikes } = await db.from('likes').select('id').eq('to_user_id', sessionUser.id);
            
            const seenLikeIdsKey = `seenLikeIds_${sessionUser.id}`;
            const seenLikeIds = JSON.parse(localStorage.getItem(seenLikeIdsKey) || '[]');
            
            const newLikes = (recLikes || []).filter(l => !seenLikeIds.includes(l.id));

            if (newLikes.length > 0) {
                const btnFindDate = document.getElementById('btnFindDate');
                if (btnFindDate && !btnFindDate.innerHTML.includes('like-badge')) {
                    btnFindDate.innerHTML += ` <span class="like-badge"><i class="ph-fill ph-heart"></i> ${newLikes.length}</span>`;
                }
            }
        };
        checkLikes();

        // 6. Check for Unread Messages
        const checkUnreadMessages = async () => {
            if (!db || !sessionUser) return;
            const { count } = await db.from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('to_user_id', sessionUser.id)
                .eq('is_read', false);
            
            if (count && count > 0) {
                const btnFindDate = document.getElementById('btnFindDate');
                if (btnFindDate) {
                    btnFindDate.innerHTML = `<i class="ph-fill ph-chat-circle-dots"></i> 인연 찾기 <span class="msg-badge">${count}</span>`;
                }
            }
        };
        checkUnreadMessages();
    }

    // --- Profile Form Handler ---
    const isProfilePage = window.location.pathname.includes('profile.html');
    if (isProfilePage) {
        const sessionUser = getSessionUser();
        if (!sessionUser) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'index.html';
            return;
        }

        const profileForm = document.getElementById('profileForm');
        
        // --- 이미지 미리보기 기능 ---
        const setupImagePreview = (inputId) => {
            const input = document.getElementById(inputId);
            if (!input) return;
            input.addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const box = input.closest('.photo-box');
                        box.style.backgroundImage = `url(${e.target.result})`;
                        box.style.backgroundSize = 'cover';
                        box.style.backgroundPosition = 'center';
                        const label = box.querySelector('.photo-label');
                        if (label) label.style.display = 'none'; // 아이콘 및 텍스트 숨기기
                    }
                    reader.readAsDataURL(file);
                }
            });
        };
        setupImagePreview('photo1');
        setupImagePreview('photo2');
        setupImagePreview('photo3');

        // --- 기존 프로필 불러오기 (수정 모드) ---
        const loadExistingProfile = async () => {
            if (!db) return;
            const { data: profile } = await db.from('profiles').select('*').eq('user_id', sessionUser.id).single();
            if (profile) {
                // 텍스트/숫자/셀렉트/텍스트에리어 값 채우기
                const setVal = (id, val) => { if (document.getElementById(id) && val) document.getElementById(id).value = val; };
                setVal('profileName', profile.name);
                setVal('birthYear', profile.birth_year);
                setVal('bodyType', profile.body_type);
                setVal('location', profile.location);
                setVal('height', profile.height);
                setVal('job', profile.job);
                setVal('jobLocation', profile.job_location);
                setVal('mbti', profile.mbti);
                setVal('smoking', profile.smoking);
                setVal('drinking', profile.drinking);
                setVal('tattoo', profile.tattoo);
                setVal('religion', profile.religion);
                setVal('longDistance', profile.long_distance);
                setVal('hobbies', profile.hobbies);
                setVal('introMessage', profile.intro_message);
                setVal('idealType', profile.ideal_type);
                
                // 프롬프트 (기능 1번)
                setVal('prompt1', profile.prompt1);
                setVal('answer1', profile.answer1);
                setVal('prompt2', profile.prompt2);
                setVal('answer2', profile.answer2);
                setVal('prompt3', profile.prompt3);
                setVal('answer3', profile.answer3);

                // 라디오 버튼 (성별) 채우기
                if (profile.gender) {
                    const radio = document.querySelector(`input[name="gender"][value="${profile.gender}"]`);
                    if (radio) radio.checked = true;
                }

                // 사진 채우기
                const setPhoto = (inputId, url) => {
                    if (url) {
                        const box = document.getElementById(inputId).closest('.photo-box');
                        box.style.backgroundImage = `url(${url})`;
                        box.style.backgroundSize = 'cover';
                        box.style.backgroundPosition = 'center';
                        const label = box.querySelector('.photo-label');
                        if (label) label.style.display = 'none';
                        // 이미 사진이 있으므로 required 해제 (새로 안 올려도 됨)
                        document.getElementById(inputId).removeAttribute('required');
                    }
                };
                setPhoto('photo1', profile.photo1);
                setPhoto('photo2', profile.photo2);
                setPhoto('photo3', profile.photo3);
            }
        };
        loadExistingProfile();

        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                // === 입력값 유효성 검사 ===
                const vName = document.getElementById('profileName').value.trim();
                const vGender = document.querySelector('input[name="gender"]:checked')?.value || '';
                const vBirthYear = document.getElementById('birthYear').value.trim();
                const vHeight = document.getElementById('height').value.trim();
                const vMbti = document.getElementById('mbti').value.trim().toUpperCase();
                const vHobbies = document.getElementById('hobbies').value.trim();
                const vIntro = document.getElementById('introMessage').value.trim();
                const vIdeal = document.getElementById('idealType').value.trim();
                const vJob = document.getElementById('job').value.trim();
                const vLocation = document.getElementById('location').value.trim();

                const errors = [];

                // 이름: 2~10글자, 한글만
                if (vName.length < 2 || vName.length > 10) errors.push('이름은 2~10글자로 입력해주세요.');
                if (!/^[가-힣]+$/.test(vName)) errors.push('이름은 한글만 입력 가능합니다.');

                // 성별 선택
                if (!vGender) errors.push('성별을 선택해주세요.');

                // 출생연도: 1970~2006 사이 숫자
                const birthNum = parseInt(vBirthYear);
                if (!vBirthYear || isNaN(birthNum) || birthNum < 1970 || birthNum > 2006) {
                    errors.push('출생연도는 1970~2006 사이의 숫자를 입력해주세요.');
                }

                // 키: 100~250 사이 숫자
                const heightNum = parseInt(vHeight);
                if (!vHeight || isNaN(heightNum) || heightNum < 100 || heightNum > 250) {
                    errors.push('키는 100~250cm 사이의 숫자를 입력해주세요.');
                }

                // MBTI: 정확한 4글자 조합
                const validMbti = ['ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP','ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ'];
                if (!validMbti.includes(vMbti)) {
                    errors.push('올바른 MBTI를 입력해주세요. (예: ENFP, ISTJ)');
                }

                // 직업: 2글자 이상
                if (vJob.length < 2) errors.push('직업/직장을 2글자 이상 입력해주세요.');

                // 거주지역: 2글자 이상
                if (vLocation.length < 2) errors.push('거주 지역을 2글자 이상 입력해주세요.');

                // 관심사: 최소 3개
                const hobbiesList = vHobbies.split(/[\s,]+/).filter(h => h.trim() !== '');
                if (hobbiesList.length < 3) {
                    errors.push('관심사/취미를 최소 3개 이상 입력해주세요. (띄어쓰기 또는 쉼표로 구분)');
                }

                // 자기소개: 최소 20글자
                if (vIntro.length < 20) {
                    errors.push(`한 줄 자기소개를 20글자 이상 입력해주세요. (현재 ${vIntro.length}글자)`);
                }

                // 이상형: 최소 20글자
                if (vIdeal.length < 20) {
                    errors.push(`이상형 설명을 20글자 이상 입력해주세요. (현재 ${vIdeal.length}글자)`);
                }

                // 사진 3장 필수 체크 (required 속성이 있는 경우에만 체크 - 신규 등록 시)
                const p1 = document.getElementById('photo1');
                const p2 = document.getElementById('photo2');
                const p3 = document.getElementById('photo3');
                
                // 만약 edit 모드에서 이미지가 이미 로드되어 required가 해제되었다면 체크 패스
                const isP1Missing = p1.hasAttribute('required') && !p1.files[0];
                const isP2Missing = p2.hasAttribute('required') && !p2.files[0];
                const isP3Missing = p3.hasAttribute('required') && !p3.files[0];

                if (isP1Missing || isP2Missing || isP3Missing) {
                    errors.push('사진은 반드시 3장 모두 등록해야 합니다.');
                }

                if (errors.length > 0) {
                    alert('⚠️ 입력값을 확인해주세요:\n\n' + errors.join('\n'));
                    return;
                }

                const profileData = {
                    user_id: sessionUser.id,
                    name: vName,
                    gender: vGender,
                    birth_year: vBirthYear,
                    body_type: document.getElementById('bodyType').value,
                    location: vLocation,
                    height: vHeight,
                    job: vJob,
                    job_location: document.getElementById('jobLocation').value,
                    mbti: vMbti,
                    smoking: document.getElementById('smoking').value,
                    drinking: document.getElementById('drinking').value,
                    tattoo: document.getElementById('tattoo').value,
                    religion: document.getElementById('religion').value,
                    long_distance: document.getElementById('longDistance').value,
                    hobbies: vHobbies,
                    intro_message: vIntro,
                    ideal_type: vIdeal,
                    prompt1: document.getElementById('prompt1').value,
                    answer1: document.getElementById('answer1').value.trim(),
                    prompt2: document.getElementById('prompt2').value,
                    answer2: document.getElementById('answer2').value.trim(),
                    prompt3: document.getElementById('prompt3').value,
                    answer3: document.getElementById('answer3').value.trim(),
                    updated_at: new Date().toISOString()
                };

                if (!db) {
                    alert('데이터베이스 연결이 설정되지 않았습니다.');
                    return;
                }

                // --- UI 비활성화 및 로딩 표시 ---
                const submitBtn = profileForm.querySelector('button[type="submit"]');
                const originalBtnText = submitBtn.innerText;
                submitBtn.innerText = '사진 업로드 및 저장 중...';
                submitBtn.disabled = true;

                // --- 파일 업로드 함수 ---
                const uploadPhoto = async (fileInputId) => {
                    const fileInput = document.getElementById(fileInputId);
                    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return null;
                    
                    const file = fileInput.files[0];
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${sessionUser.id}_${fileInputId}_${Date.now()}.${fileExt}`;
                    const filePath = `${sessionUser.id}/${fileName}`;
                    
                    const { error: uploadError } = await db.storage.from('profile_photos').upload(filePath, file);
                    if (uploadError) {
                        const errMsg = `사진 업로드 실패 (${fileInputId}): ${uploadError.message}`;
                        alert(errMsg + '\n\n* Storage 권한 문제일 가능성이 높습니다.');
                        logError(errMsg, sessionUser.id);
                        return null; 
                    }
                    
                    const { data } = db.storage.from('profile_photos').getPublicUrl(filePath);
                    return data.publicUrl;
                };

                // 순차적으로 업로드 진행
                try {
                    const url1 = await uploadPhoto('photo1');
                    const url2 = await uploadPhoto('photo2');
                    const url3 = await uploadPhoto('photo3');

                    if (url1) profileData.photo1 = url1;
                    if (url2) profileData.photo2 = url2;
                    if (url3) profileData.photo3 = url3;

                    const { error } = await db.from('profiles').upsert(profileData);

                    if (error) {
                        const errMsg = `프로필 저장 실패: ${error.message}`;
                        alert(errMsg + '\n\n* DB 컬럼이 부족하거나 설정 문제일 수 있습니다.');
                        logError(errMsg, sessionUser.id);
                    } else {
                        alert('프로필과 사진이 성공적으로 저장되었습니다!');
                        window.location.href = 'main.html';
                    }
                } catch (e) {
                    alert('처리 중 오류가 발생했습니다: ' + e.message);
                } finally {
                    submitBtn.innerText = originalBtnText;
                    submitBtn.disabled = false;
                }
            });
        }
    }

    // --- Admin Dashboard Logic ---
    const isAdminPage = window.location.pathname.includes('admin.html');
    if (isAdminPage) {
        const sessionUser = getSessionUser();

        // 1단계: localStorage 에서 세션 확인
        if (!sessionUser) {
            alert('로그인이 필요합니다.');
            window.location.href = 'index.html';
            return;
        }

        // 2단계: DB에서 role 재확인 (브라우저 조작 우회 차단)
        if (db) {
            const { data: dbUser, error: roleError } = await db
                .from('users')
                .select('role')
                .eq('id', sessionUser.id)
                .single();

            if (roleError || !dbUser || dbUser.role !== 'admin') {
                alert('관리자 권한이 없습니다.');
                window.location.href = 'index.html';
                return;
            }
        } else {
            alert('데이터베이스 연결이 필요합니다.');
            window.location.href = 'index.html';
            return;
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }

        const openAdminModal = (title, bodyHtml) => {
            document.getElementById('adminModalTitle').innerText = title;
            document.getElementById('adminModalBody').innerHTML = bodyHtml;
            document.getElementById('adminModalOverlay').style.display = 'flex';
        };
        window.closeAdminModal = () => {
            document.getElementById('adminModalOverlay').style.display = 'none';
        };

        const loadPendingUsers = async () => {
            const listBody = document.getElementById('adminUserList');
            if (!listBody || !db) return;

            const { data: users, error } = await db.from('users').select('*').order('created_at', { ascending: false });
            
            // [추가] 오늘 보낸 매칭 신청 데이터 일괄 조회
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const { data: todayMatches } = await db.from('matches')
                .select('from_user_id')
                .gte('created_at', todayStart.toISOString());
            
            const countMap = {};
            (todayMatches || []).forEach(m => {
                countMap[m.from_user_id] = (countMap[m.from_user_id] || 0) + 1;
            });
            
            if (error) {
                listBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--primary);">오류 발생: ${error.message}</td></tr>`;
                return;
            }

            if (!users || users.length === 0) {
                listBody.innerHTML = `<tr><td colspan="8" style="text-align: center;">가입 대기 중인 회원이 없습니다.</td></tr>`;
                return;
            }

            listBody.innerHTML = users.map(u => {
                const statusBadge = u.status === 'pending' ? '<span class="badge pending">대기</span>' : '<span class="badge approved">승인됨</span>';
                return `
                <tr>
                    <td style="color: #888; font-family: monospace; min-width: 140px;">${escapeHtml(u.id)}</td>
                    <td style="font-weight: 800;">${escapeHtml(u.name)}</td>
                    <td style="font-size: 0.9rem;">${escapeHtml(u.phone || '-')}</td>
                    <td>${escapeHtml(u.referrer || '-')}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <button class="btn-small secondary" style="padding: 2px 8px;" onclick="changeUserLimit('${u.id}', ${u.daily_limit || 2}, -1)">-</button>
                            <span style="font-weight: bold; min-width: 45px; color: ${ (countMap[u.id] || 0) >= (u.daily_limit || 2) ? '#ff4d6d' : ((countMap[u.id] || 0) > 0 ? '#ffce00' : '#888') }">
                                ${countMap[u.id] || 0} / ${u.daily_limit || 2}
                            </span>
                            <button class="btn-small secondary" style="padding: 2px 8px;" onclick="changeUserLimit('${u.id}', ${u.daily_limit || 2}, 1)">+</button>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn-small secondary" onclick="window.location.href='profile_view.html?id=${u.id}'" title="원본 프로필 보기"><i class="ph ph-user-focus"></i></button>
                            <button class="btn-small secondary" onclick="window.location.href='match_status.html?id=${u.id}'" title="신청/매칭 내역"><i class="ph ph-arrows-left-right"></i></button>
                            <button class="btn-small secondary" onclick="viewUserMessages('${u.id}')" title="메시지 로그"><i class="ph ph-chat-text"></i></button>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${u.status === 'pending'
                                ? `<button class="btn-small" onclick="approveUser('${escapeHtml(u.id)}')">승인</button>`
                                : ``
                            }
                            ${u.role !== 'admin' ? `<button class="btn-small" style="background: rgba(255, 77, 109, 0.1); color: #ff4d6d; border: 1px solid rgba(255, 77, 109, 0.3);" onclick="deleteUser('${escapeHtml(u.id)}')">삭제</button>` : ''}
                        </div>
                    </td>
                </tr>
            `}).join('');
        };

        window.approveUser = async (userId) => {
            if (!confirm(`${userId} 님의 가입을 승인하시겠습니까?`)) return;
            
            const { error } = await db.from('users').update({ status: 'approved' }).eq('id', userId);
            
            if (error) {
                alert('승인 처리 중 오류 발생: ' + error.message);
            } else {
                alert('승인되었습니다.');
                loadPendingUsers();
            }
        };

        window.changeUserLimit = async (userId, currentLimit, delta) => {
            const newLimit = currentLimit + delta;
            if (newLimit < 0) return;
            
            const { error } = await db.from('users').update({ daily_limit: newLimit }).eq('id', userId);
            if (error) {
                alert('한도 수정 실패: ' + error.message);
            } else {
                loadPendingUsers();
            }
        };

        window.deleteUser = async (userId) => {
            if (!confirm(`정말 ${userId} 회원을 탈퇴 처리하시겠습니까?\n해당 회원의 프로필 및 모든 매칭 데이터가 영구적으로 삭제됩니다.`)) return;
            
            if (!db) return;

            try {
                // 1. 메시지 데이터 삭제
                await db.from('messages').delete().or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
                // 2. 매칭 데이터 삭제
                await db.from('matches').delete().or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
                // 3. 좋아요 데이터 삭제
                await db.from('likes').delete().or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
                // 4. 프로필 데이터 삭제
                await db.from('profiles').delete().eq('user_id', userId);
                // 5. 사용자 계정 삭제
                const { error } = await db.from('users').delete().eq('id', userId);
                
                if (error) throw error;
                
                alert(`${userId} 회원이 성공적으로 탈퇴 처리되었습니다.`);
                loadPendingUsers();
            } catch (err) {
                alert('탈퇴 처리 중 오류 발생: ' + err.message);
                console.error(err);
            }
        };

        window.viewUserMatches = async (userId) => {
            const { data: sent } = await db.from('matches').select('*').eq('from_user_id', userId);
            const { data: received } = await db.from('matches').select('*').eq('to_user_id', userId);
            const { data: allProfiles } = await db.from('profiles').select('*');
            const pMap = {};
            allProfiles?.forEach(p => pMap[p.user_id] = p);

            const renderMatchCard = (targetId, status, msg, isFromMe) => {
                const p = pMap[targetId];
                if (!p) return '';
                const badgeClass = status === 'approved' ? 'badge-success' : 'badge-pending';
                const badgeText = status === 'approved' ? '매칭 성공' : (status === 'rejected' ? '거절됨' : '대기 중');
                
                return `
                    <div class="match-item ${status === 'approved' ? 'success' : ''}" style="margin-bottom: 10px; cursor: default;">
                        <div class="user-info">
                            <div class="user-avatar-small"><i class="ph-fill ph-user"></i></div>
                            <div class="user-details">
                                <h4>${isFromMe ? '→ ' : '← '}${p.name}</h4>
                                <p>${p.birth_year}년생 · ${p.location}</p>
                                ${msg ? `<div style="margin-top: 5px; font-size: 0.8rem; color: #aaa; background: rgba(255,255,255,0.05); padding: 5px; border-radius: 5px;">"${escapeHtml(msg)}"</div>` : ''}
                            </div>
                        </div>
                        <span class="match-status-badge ${badgeClass}">${badgeText}</span>
                    </div>
                `;
            };

            let html = '<div style="max-height: 500px; overflow-y: auto;">';
            html += '<h4 style="margin-bottom: 10px; color: var(--primary);">보낸 신청 내역</h4>';
            if (!sent || sent.length === 0) html += '<p style="color: #666; font-size: 0.9rem; margin-bottom: 20px;">- 신청 내역 없음</p>';
            else html += sent.map(m => renderMatchCard(m.to_user_id, m.status, m.message, true)).join('') + '<div style="margin-bottom: 20px;"></div>';

            html += '<h4 style="margin-bottom: 10px; color: var(--primary);">받은 신청 내역</h4>';
            if (!received || received.length === 0) html += '<p style="color: #666; font-size: 0.9rem;">- 받은 내역 없음</p>';
            else html += received.map(m => renderMatchCard(m.from_user_id, m.status, m.message, false)).join('');
            html += '</div>';

            openAdminModal(`[매칭 기록] ${userId.substring(0,8)}...`, html);
        };

        window.viewUserMessages = async (userId) => {
            const { data: logs } = await db.from('messages')
                .select('*')
                .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
                .order('created_at', { ascending: true });

            if (!logs || logs.length === 0) {
                openAdminModal(`메시지 로그`, '<p>대화 내역이 없습니다.</p>');
                return;
            }

            // Group by partner
            const conversations = {};
            logs.forEach(l => {
                const partnerId = l.from_user_id === userId ? l.to_user_id : l.from_user_id;
                if (!conversations[partnerId]) conversations[partnerId] = [];
                conversations[partnerId].push(l);
            });

            // Get partner names
            const partnerIds = Object.keys(conversations);
            const { data: partners } = await db.from('users').select('id, name').in('id', partnerIds);
            const nameMap = {};
            partners?.forEach(p => nameMap[p.id] = p.name);

            let html = '<div style="display: flex; gap: 20px; height: 500px;">';
            
            // Left: Partner List
            html += '<div style="width: 200px; border-right: 1px solid var(--border); padding-right: 10px; overflow-y: auto;">';
            partnerIds.forEach(pid => {
                html += `<button class="btn-action secondary" style="width: 100%; margin-bottom: 8px; font-size: 0.85rem; text-align: left; padding: 10px;" onclick="showAdminChat('${userId}', '${pid}')">
                    <i class="ph ph-user"></i> ${escapeHtml(nameMap[pid] || pid.substring(0,5))}
                </button>`;
            });
            html += '</div>';

            // Right: Chat Window
            html += '<div id="adminChatWindow" style="flex: 1; overflow-y: auto; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 10px;">';
            html += '<p style="text-align: center; color: #666; margin-top: 100px;">대화 상대를 선택해주세요.</p>';
            html += '</div></div>';

            // Define global helper for the modal session
            window.adminAllLogs = logs;
            window.showAdminChat = (currentUid, partnerUid) => {
                const chatBox = document.getElementById('adminChatWindow');
                const chatLogs = window.adminAllLogs.filter(l => (l.from_user_id === currentUid && l.to_user_id === partnerUid) || (l.from_user_id === partnerUid && l.to_user_id === currentUid));
                
                chatBox.innerHTML = chatLogs.map(l => `
                    <div style="margin-bottom: 12px; text-align: ${l.from_user_id === currentUid ? 'right' : 'left'}">
                        <div style="font-size: 0.7rem; color: #666; margin-bottom: 3px;">${new Date(l.created_at).toLocaleString()}</div>
                        <div style="display: inline-block; padding: 8px 12px; border-radius: 12px; background: ${l.from_user_id === currentUid ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; color: ${l.from_user_id === currentUid ? 'white' : 'inherit'}; max-width: 80%; word-break: break-all;">
                            ${escapeHtml(l.content)}
                        </div>
                    </div>
                `).join('');
                chatBox.scrollTop = chatBox.scrollHeight;
            };

            openAdminModal(`[메시지 로그] ${userId.substring(0,8)}...`, html);
        };

        loadPendingUsers();

        // 텔레그램 테스트 버튼
        const testBtn = document.getElementById('testTelegramBtn');
        if (testBtn) {
            testBtn.addEventListener('click', async () => {
                testBtn.disabled = true;
                testBtn.innerText = '전송 중...';
                
                const msg = `✅ <b>Blind Date 텔레그램 연결 성공!</b>\n\n새로운 봇으로 알림이 정상적으로 연동되었습니다.`;
                await sendTelegramMessage(msg);
                
                alert('텔레그램으로 테스트 메시지를 전송했습니다. 봇 채팅창을 확인해주세요!');
                testBtn.disabled = false;
                testBtn.innerText = '텔레그램 알림 테스트';
            });
        }
    }

    // --- Profile View Logic ---
    const isProfileViewPage = window.location.pathname.includes('profile_view.html');
    if (isProfileViewPage) {
        const sessionUser = getSessionUser();
        if (!sessionUser) {
            alert('로그인이 필요한 서비스입니다.');
            window.location.href = 'index.html';
            return;
        }

        const loadProfileView = async () => {
            if (!db) return;
            
            const urlParams = new URLSearchParams(window.location.search);
            const targetUserId = urlParams.get('id') || sessionUser.id;
            const isSelf = targetUserId === sessionUser.id;

            // [추가] 프로필 조회 로그 기록 (본인 제외)
            if (!isSelf && db) {
                try {
                    await db.from('profile_views').insert([{
                        viewer_id: sessionUser.id,
                        target_id: targetUserId,
                        viewed_at: new Date().toISOString()
                    }]);
                } catch (e) {
                    console.error('조회 로그 기록 실패:', e);
                }
            }

            // 1. Fetch Profile Data
            const { data: profile, error } = await db.from('profiles').select('*').eq('user_id', targetUserId).single();
            
            document.getElementById('loadingMsg').style.display = 'none';

            if (error || !profile) {
                alert('프로필을 찾을 수 없습니다.');
                window.location.href = 'main.html';
                return;
            }

            // 2. Fetch Match Status (if not self)
            let isMatched = false;
            let myRequestStatus = null; // 'pending' or 'rejected' or null
            let mutual = null;

            if (!isSelf) {
                // Check if I liked them
                const { data: myReq } = await db.from('matches').select('status').eq('from_user_id', sessionUser.id).eq('to_user_id', targetUserId).maybeSingle();
                myRequestStatus = myReq?.status;

                // Check if we are mutually matched
                const { data: mutualData } = await db.from('matches').select('status').eq('from_user_id', targetUserId).eq('to_user_id', sessionUser.id).maybeSingle();
                mutual = mutualData;
                
                if (myRequestStatus === 'pending' && mutual && mutual.status === 'pending') {
                    isMatched = true;
                }

                // 나를 좋아요 했는지 확인 (기능 3번)
                const { data: likedMe } = await db.from('likes').select('id').eq('from_user_id', targetUserId).eq('to_user_id', sessionUser.id).maybeSingle();
                if (likedMe) {
                    const banner = document.getElementById('likedBanner');
                    if (banner) banner.style.display = 'block';
                }
            }

            document.getElementById('profileViewCard').style.display = 'block';

            // 3. Photo Slider Logic
            // 보안: 매칭 전에는 photo URL 자체를 클라이언트에 전달하지 않음
            const PLACEHOLDER_PHOTO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" fill="%23333"><rect width="400" height="400" fill="%231a1a2e"/><text x="200" y="185" text-anchor="middle" fill="%23666" font-size="48">🔒</text><text x="200" y="230" text-anchor="middle" fill="%23666" font-size="16">매칭 후 공개됩니다</text></svg>');
            const allPhotos = [profile.photo1, profile.photo2, profile.photo3].filter(p => p);
            
            // 매칭되었거나 본인 프로필이거나 관리자인 경우에만 실제 URL 사용
            const photos = (isSelf || isMatched || sessionUser.role === 'admin') ? allPhotos : allPhotos.map(() => PLACEHOLDER_PHOTO);
            window.profilePhotos = photos;
            window.currentPhotoIndex = 0;

            const updatePhotoView = () => {
                if (allPhotos.length === 0) {
                    document.getElementById('vPhoto').style.display = 'none';
                    document.querySelector('.view-photos').style.display = 'flex';
                    document.querySelector('.view-photos').style.alignItems = 'center';
                    document.querySelector('.view-photos').style.justifyContent = 'center';
                    document.querySelector('.view-photos').innerHTML = '<span style="color: #666;">등록된 사진이 없습니다.</span>';
                    return;
                }

                const img = document.getElementById('vPhoto');
                img.src = photos[window.currentPhotoIndex];
                img.style.display = 'block';

                // Blur logic: 매칭 전에는 placeholder에 추가 blur 적용 (관리자는 예외)
                if (!isSelf && !isMatched && sessionUser.role !== 'admin') {
                    img.classList.add('blurred');
                } else {
                    img.classList.remove('blurred');
                }

                // Update Indicators
                const indicators = document.getElementById('photoIndicators');
                if (indicators) {
                    if (allPhotos.length > 1) {
                        indicators.innerHTML = allPhotos.map((_, idx) => 
                            `<div class="photo-bar ${idx === window.currentPhotoIndex ? 'active' : ''}"></div>`
                        ).join('');
                    } else {
                        indicators.innerHTML = '';
                    }
                }
            };

            window.prevPhoto = () => {
                if (!window.profilePhotos || window.profilePhotos.length <= 1) return;
                window.currentPhotoIndex = (window.currentPhotoIndex > 0) ? window.currentPhotoIndex - 1 : window.profilePhotos.length - 1;
                updatePhotoView();
            };

            window.nextPhoto = () => {
                if (!window.profilePhotos || window.profilePhotos.length <= 1) return;
                window.currentPhotoIndex = (window.currentPhotoIndex < window.profilePhotos.length - 1) ? window.currentPhotoIndex + 1 : 0;
                updatePhotoView();
            };

            updatePhotoView();

            // 4. Fill Information
            const genderSymbol = profile.gender === '여성' ? 
                '<span style="color: #ff4d6d; font-size: 0.85em; margin-left: 4px; font-weight: bold;">♀</span>' : 
                '<span style="color: #4361ee; font-size: 0.85em; margin-left: 4px; font-weight: bold;">♂</span>';
            document.getElementById('vName').innerHTML = profile.name + genderSymbol;
            document.getElementById('vAge').innerText = profile.birth_year + '년생';
            document.getElementById('vLocation').innerText = profile.location;
            document.getElementById('vHeight').innerText = profile.height + 'cm';
            document.getElementById('vBodyTypeTop').innerText = profile.body_type || '보통';
            
            document.getElementById('vJob').innerText = profile.job + (profile.job_location ? ` (${profile.job_location})` : '');
            document.getElementById('vMbti').innerText = profile.mbti;
            document.getElementById('vSmoking').innerText = profile.smoking;
            document.getElementById('vDrinking').innerText = profile.drinking;
            document.getElementById('vTattoo').innerText = profile.tattoo;
            document.getElementById('vReligion').innerText = profile.religion;
            document.getElementById('vLongDistance').innerText = profile.long_distance || '장거리 무관';
            
            document.getElementById('vIntro').innerText = profile.intro_message;
            document.getElementById('vIdeal').innerText = profile.ideal_type;

            // 프롬프트 표시 (기능 1번)
            const promptsArea = document.getElementById('vPromptsArea');
            let hasPrompt = false;
            for (let i = 1; i <= 3; i++) {
                const q = profile[`prompt${i}`];
                const a = profile[`answer${i}`];
                if (q && a) {
                    hasPrompt = true;
                    const el = document.getElementById(`vPrompt${i}`);
                    el.querySelector('.prompt-q').innerText = q;
                    el.querySelector('.prompt-a').innerText = a;
                    el.style.display = 'block';
                }
            }
            if (hasPrompt && promptsArea) promptsArea.style.display = 'block';

            const hobbiesArea = document.getElementById('vHobbiesArea');
            if (profile.hobbies) {
                const hobbiesList = profile.hobbies.split(/[\s,]+/).filter(h => h.trim() !== '');
                hobbiesArea.innerHTML = hobbiesList.map(h => `<div class="view-tag">#${h.replace(/^#/, '')}</div>`).join('');
            }

            // 5. Message Chat Logic (매칭 전 메시지 기능)
            const MSG_LIMIT = 10;
            const chatArea = document.getElementById('messageChatArea');
            const chatMessagesEl = document.getElementById('chatMessages');
            const chatInput = document.getElementById('chatInput');
            const chatSendBtn = document.getElementById('chatSendBtn');
            const chatStatusMsg = document.getElementById('chatStatusMsg');
            const msgCountBadge = document.getElementById('msgCountBadge');
            const btnDeleteChat = document.getElementById('btnDeleteChat');

            // 메시지 시간 포맷 함수
            const formatMsgTime = (dateStr) => {
                const d = new Date(dateStr);
                const month = d.getMonth() + 1;
                const day = d.getDate();
                const h = d.getHours();
                const m = String(d.getMinutes()).padStart(2, '0');
                const ampm = h >= 12 ? '오후' : '오전';
                const hour12 = h % 12 || 12;
                return `${month}/${day} ${ampm} ${hour12}:${m}`;
            };

            // 메시지 렌더링
            const renderMessages = (messages) => {
                if (!messages || messages.length === 0) {
                    chatMessagesEl.innerHTML = `
                        <div class="chat-empty">
                            <i class="ph ph-chat-teardrop-text"></i>
                            매칭 전 가벼운 대화를 나눠보세요!
                        </div>`;
                    return;
                }
                chatMessagesEl.innerHTML = messages.map(m => `
                    <div class="chat-bubble ${m.from_user_id === sessionUser.id ? 'mine' : 'theirs'}">
                        ${escapeHtml(m.content)}
                        <span class="chat-time">${formatMsgTime(m.created_at)}</span>
                    </div>
                `).join('');
                chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
            };

            // 입력 상태 업데이트
            const updateChatInputState = (messages, mySentCount) => {
                const lastMsg = messages?.length > 0 ? messages[messages.length - 1] : null;
                const isMyTurn = !lastMsg || lastMsg.from_user_id !== sessionUser.id;

                msgCountBadge.textContent = `${mySentCount}/${MSG_LIMIT}`;

                // 매칭 결정 후 → 삭제만 가능
                const isMatchDecided = isMatched || myRequestStatus === 'rejected';
                const wasRejectedByMe = mutual && mutual.status === 'rejected';

                if (isMatchDecided || wasRejectedByMe) {
                    chatInput.disabled = true;
                    chatSendBtn.disabled = true;
                    chatInput.placeholder = '매칭이 결정되었습니다.';
                    document.getElementById('chatInputArea').style.display = 'none';
                    if (messages && messages.length > 0) {
                        btnDeleteChat.style.display = 'flex';
                    }
                    return;
                }

                if (mySentCount >= MSG_LIMIT) {
                    chatInput.disabled = true;
                    chatSendBtn.disabled = true;
                    chatInput.placeholder = '';
                    chatStatusMsg.innerHTML = '<i class="ph ph-prohibit"></i> 메시지를 모두 사용했습니다. (10/10)';
                    chatStatusMsg.style.display = 'block';
                } else if (!isMyTurn) {
                    chatInput.disabled = true;
                    chatSendBtn.disabled = true;
                    chatInput.placeholder = '';
                    chatStatusMsg.innerHTML = '<i class="ph ph-hourglass-medium"></i> 상대방의 답장을 기다려주세요...';
                    chatStatusMsg.style.display = 'block';
                } else {
                    chatInput.disabled = false;
                    chatSendBtn.disabled = false;
                    chatInput.placeholder = '메시지를 입력하세요... (최대 200자)';
                    chatStatusMsg.style.display = 'none';
                }
            };

            // 메시지 로드 + 읽음 처리
            const loadAndRenderMessages = async () => {
                if (!db || isSelf) return;

                // 양방향 메시지 전체 로드
                const { data: messages } = await db.from('messages')
                    .select('*')
                    .or(`and(from_user_id.eq.${sessionUser.id},to_user_id.eq.${targetUserId}),and(from_user_id.eq.${targetUserId},to_user_id.eq.${sessionUser.id})`)
                    .order('created_at', { ascending: true });

                // 내가 보낸 메시지 수
                const mySentCount = (messages || []).filter(m => m.from_user_id === sessionUser.id).length;

                renderMessages(messages);
                updateChatInputState(messages, mySentCount);

                // 상대가 나에게 보낸 메시지 읽음 처리
                await db.from('messages')
                    .update({ is_read: true })
                    .eq('from_user_id', targetUserId)
                    .eq('to_user_id', sessionUser.id)
                    .eq('is_read', false);
            };

            // 채팅 영역 표시 (본인 아닌 경우 + 관리자 아닌 경우만)
            if (!isSelf && sessionUser.role !== 'admin') {
                chatArea.style.display = 'block';
                loadAndRenderMessages();

                // 메시지 전송 핸들러
                const sendMessage = async () => {
                    const content = chatInput.value.trim();
                    if (!content || !db) return;
                    if (content.length > 200) {
                        alert('메시지는 200자까지 입력 가능합니다.');
                        return;
                    }

                    chatSendBtn.disabled = true;
                    chatInput.disabled = true;

                    const { error } = await db.from('messages').insert([{
                        from_user_id: sessionUser.id,
                        to_user_id: targetUserId,
                        content: content,
                        is_read: false
                    }]);

                    if (error) {
                        alert('메시지 전송 실패: ' + error.message);
                        chatSendBtn.disabled = false;
                        chatInput.disabled = false;
                    } else {
                        chatInput.value = '';
                        await loadAndRenderMessages();
                    }
                };

                chatSendBtn.addEventListener('click', sendMessage);
                chatInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') sendMessage();
                });

                // 대화 기록 삭제 핸들러
                btnDeleteChat.addEventListener('click', async () => {
                    if (!confirm('대화 기록을 모두 삭제하시겠습니까?\n삭제된 메시지는 복구할 수 없습니다.')) return;

                    // 양방향 메시지 삭제
                    await db.from('messages').delete()
                        .or(`and(from_user_id.eq.${sessionUser.id},to_user_id.eq.${targetUserId}),and(from_user_id.eq.${targetUserId},to_user_id.eq.${sessionUser.id})`);
                    
                    alert('대화 기록이 삭제되었습니다.');
                    btnDeleteChat.style.display = 'none';
                    renderMessages([]);
                });
            }

            // 6. Match Action Logic
            const actionArea = document.getElementById('matchActionArea');
            const selfMsg = document.getElementById('selfProfileMsg');

            if (isSelf) {
                selfMsg.style.display = 'block';
            } else {
                if (sessionUser.role !== 'admin') {
                    actionArea.style.display = 'block';
                }
                
                const successMsg = document.getElementById('matchSuccessMsg');
                const matchButtons = document.getElementById('matchButtons');
                const btnRequest = document.getElementById('btnRequestMatch');
                const btnReject = document.getElementById('btnReject');

                // Check if they sent a request to me
                const { data: incomingReq } = await db.from('matches')
                    .select('id')
                    .eq('from_user_id', targetUserId)
                    .eq('to_user_id', sessionUser.id)
                    .eq('status', 'pending')
                    .maybeSingle();

                if (isMatched) {
                    // Reveal Phone Number
                    const { data: targetUser } = await db.from('users').select('phone').eq('id', targetUserId).single();
                    document.getElementById('vPhone').innerText = targetUser?.phone || '공개 불가';
                    successMsg.style.display = 'block';
                    matchButtons.style.display = 'none';
                    // 매칭 성공 시 메시지 영역 숨기지 않되, 입력 비활성화 (loadAndRenderMessages에서 처리됨)
                } else if (incomingReq) {
                    // Received a request - This should have priority (even if I was previously rejected)
                    btnRequest.innerText = '매칭 수락하기';
                    btnRequest.classList.add('btn-highlight');
                    btnReject.innerText = '거절하기';
                    btnReject.style.display = 'block';
                } else if (mutual && mutual.status === 'rejected') {
                    // I rejected them
                    btnRequest.innerText = '다시 매칭하기';
                    btnRequest.disabled = false;
                    btnRequest.style.opacity = '1';
                    btnRequest.style.cursor = 'pointer';
                    btnReject.style.display = 'none';
                    btnRequest.classList.remove('btn-highlight');
                } else if (myRequestStatus === 'pending') {
                    btnRequest.innerText = '매칭 신청 완료';
                    btnRequest.disabled = true;
                    btnRequest.style.opacity = '0.7';
                    btnReject.style.display = 'none';
                } else if (myRequestStatus === 'rejected') {
                    // They rejected me
                    btnRequest.innerText = '거절 당함';
                    btnRequest.disabled = true;
                    btnRequest.style.opacity = '0.5';
                    btnRequest.style.cursor = 'not-allowed';
                    btnReject.style.display = 'none';
                    btnRequest.classList.remove('btn-highlight');
                }

                const showMatchSuccess = () => {
                    const overlay = document.createElement('div');
                    overlay.className = 'match-overlay';
                    overlay.innerHTML = `
                        <div class="match-heart"><i class="ph-fill ph-heart"></i></div>
                        <div class="match-text">매칭이 성사되었습니다!</div>
                        <p style="color: white; margin-top: 20px; font-size: 1.1rem;">상대방의 연락처를 확인해보세요.</p>
                        <button class="btn-action" style="width: auto; padding: 12px 40px; margin-top: 30px;" onclick="window.location.reload()">확인</button>
                    `;
                    document.body.appendChild(overlay);
                };

                // Event Listeners
                btnRequest.onclick = async () => {
                    if (myRequestStatus === 'pending') return;

                    // [추가] 하루 매칭 신청 제한 (유저별 설정값 기준) - 수락(incomingReq)이 아닌 경우에만 체크
                    if (!incomingReq) {
                        // 유저의 한도 정보를 다시 가져옴 (최신값 확인)
                        const { data: userData } = await db.from('users').select('daily_limit').eq('id', sessionUser.id).single();
                        const dailyLimit = userData?.daily_limit || 2;

                        const todayStart = new Date();
                        todayStart.setHours(0, 0, 0, 0);
                        
                        const { count, error: countError } = await db.from('matches')
                            .select('id', { count: 'exact', head: true })
                            .eq('from_user_id', sessionUser.id)
                            .gte('created_at', todayStart.toISOString());
                        
                        if (!countError && count >= dailyLimit) {
                            alert(`⚠️ 오늘 매칭 신청 가능 횟수(${dailyLimit}회)를 모두 소진하셨습니다.\n내일 자정 이후에 다시 신청해주세요!`);
                            return;
                        }
                    }
                    
                    if (mutual && mutual.status === 'rejected') {
                        // REMATCH LOGIC: Clear the slate and start a new request
                        if (!confirm('상대방에게 다시 매칭 신청을 보내시겠습니까?')) return;
                        
                        // 1. Delete their old request that I rejected
                        await db.from('matches')
                            .delete()
                            .eq('from_user_id', targetUserId)
                            .eq('to_user_id', sessionUser.id);
                        
                        // 2. Create my new request to them
                        const { error } = await db.from('matches')
                            .insert([{ 
                                from_user_id: sessionUser.id, 
                                to_user_id: targetUserId, 
                                status: 'pending' 
                            }]);
                            
                        if (error) {
                            alert('신청 중 오류 발생: ' + error.message);
                        } else {
                            alert('다시 매칭 신청을 보냈습니다! 상대방의 수락을 기다려주세요.');
                            window.location.href = 'main.html';
                        }
                        return;
                    }

                    if (myRequestStatus === 'rejected') {
                        if (!confirm('정말 다시 매칭 신청을 보내시겠습니까?')) return;
                        
                        // 1. Delete my old rejected request
                        await db.from('matches')
                            .delete()
                            .eq('from_user_id', sessionUser.id)
                            .eq('to_user_id', targetUserId);
                            
                        // 2. Insert as a fresh pending request
                        const { error } = await db.from('matches')
                            .insert([{ 
                                from_user_id: sessionUser.id, 
                                to_user_id: targetUserId, 
                                status: 'pending' 
                            }]);
                            
                        if (error) {
                            alert('신청 중 오류 발생: ' + error.message);
                        } else {
                            alert('매칭 신청을 다시 보냈습니다!');
                            window.location.href = 'main.html';
                        }
                    } else if (incomingReq) {
                        // Accepting incoming request → 매칭 수락
                        const { error } = await db.from('matches').upsert([{ 
                            from_user_id: sessionUser.id, 
                            to_user_id: targetUserId, 
                            status: 'pending' 
                        }]);
                        
                        if (error) {
                            alert('수락 중 오류 발생: ' + error.message);
                        } else {
                            showMatchSuccess();
                        }
                    } else {
                        // New request (첫 매칭 신청) - 기능 7번: 커스텀 모달 사용
                        const msg = await showCustomModal({
                            title: '매칭 신청 메시지',
                            desc: '상대방에게 보낼 한 줄 메시지를 입력해주세요.<br>정성스러운 메시지는 성사 확률을 높여줍니다!',
                            placeholder: '예: MBTI가 같아서 친해지고 싶어요!',
                            confirmText: '신청하기',
                            cancelText: '취소'
                        });

                        if (msg === null) return; // 취소

                        const { error } = await db.from('matches').upsert([{ 
                            from_user_id: sessionUser.id, 
                            to_user_id: targetUserId, 
                            status: 'pending',
                            message: msg 
                        }]);
                        
                        if (error) {
                            alert('신청 중 오류 발생: ' + error.message);
                        } else {
                            // 좋아요가 있었다면 자동 삭제 (매칭으로 전환되므로)
                            await db.from('likes').delete().eq('from_user_id', sessionUser.id).eq('to_user_id', targetUserId);
                            
                            alert('매칭 신청을 보냈습니다! 상대방의 수락을 기다려주세요.');
                            window.location.href = 'main.html';
                        }
                    }
                };

                btnReject.onclick = async () => {
                    if (!confirm('정말 거절하시겠습니까? 다시는 볼 수 없게 됩니다.')) return;
                    
                    // To ensure the other person gets a NEW notification with a fresh timestamp:
                    // 1. Delete their existing pending request to me
                    await db.from('matches')
                        .delete()
                        .eq('from_user_id', targetUserId)
                        .eq('to_user_id', sessionUser.id);
                    
                    // 2. Insert a NEW record with status 'rejected'
                    // This creates a fresh created_at timestamp for notifications
                    const { error } = await db.from('matches')
                        .insert([{ 
                            from_user_id: targetUserId, 
                            to_user_id: sessionUser.id, 
                            status: 'rejected' 
                        }]);

                    if (error) alert('처리 중 오류 발생: ' + error.message);
                    else {
                        alert('거절되었습니다.');
                        window.location.href = 'find_date.html';
                    }
                };
            }
        };

        loadProfileView();
    }

    // --- Find Date Page Logic ---
    const isFindDatePage = window.location.pathname.includes('find_date.html');
    if (isFindDatePage) {
        const sessionUser = getSessionUser();
        if (!sessionUser) {
            window.location.href = 'index.html';
            return;
        }

        const loadMembers = async () => {
            if (!db) return;
            
            // 1. Get current user's profile to know their gender
            const { data: myProfile } = await db.from('profiles').select('gender').eq('user_id', sessionUser.id).single();
            const targetGender = myProfile?.gender === '남성' ? '여성' : (myProfile?.gender === '여성' ? '남성' : null);

            // 2. Get IDs I've already interacted with (Sent or Received match records)
            const { data: myMatches } = await db.from('matches').select('to_user_id').eq('from_user_id', sessionUser.id);
            const { data: theirMatches } = await db.from('matches').select('from_user_id').eq('to_user_id', sessionUser.id);
            
            const excludedIds = [
                ...(myMatches?.map(m => m.to_user_id) || []),
                ...(theirMatches?.map(m => m.from_user_id) || [])
            ];
            excludedIds.push(sessionUser.id); // Also exclude myself

            // 3. Fetch all profiles
            let query = db.from('profiles').select('*');
            
            // 4. Filter by gender if possible
            if (targetGender) {
                query = query.eq('gender', targetGender);
            }

            const { data: members, error } = await query;
            
            document.getElementById('loadingArea').style.display = 'none';

            if (error || !members || members.length === 0) {
                document.getElementById('noMembersMsg').style.display = 'block';
                return;
            }

            // 5. Client-side filter for excluded IDs
            const filteredMembers = members.filter(m => !excludedIds.includes(m.user_id));

            // 6. Fetch message data for badges (unread + conversations)
            const { data: myMessages } = await db.from('messages')
                .select('from_user_id, to_user_id, is_read')
                .or(`from_user_id.eq.${sessionUser.id},to_user_id.eq.${sessionUser.id}`);

            // Build per-user message info
            const msgInfoMap = {};
            (myMessages || []).forEach(msg => {
                const otherId = msg.from_user_id === sessionUser.id ? msg.to_user_id : msg.from_user_id;
                if (!msgInfoMap[otherId]) msgInfoMap[otherId] = { total: 0, unread: 0 };
                msgInfoMap[otherId].total++;
                if (msg.to_user_id === sessionUser.id && !msg.is_read) {
                    msgInfoMap[otherId].unread++;
                }
            });

            // 7. Apply Filters (기능 2번)
            const fLoc = document.getElementById('filterLocation')?.value;
            const fAge = document.getElementById('filterAge')?.value;
            const fSort = document.getElementById('filterSort')?.value;

            let finalMembers = filteredMembers;

            if (fLoc) {
                finalMembers = finalMembers.filter(m => m.location.includes(fLoc));
            }
            if (fAge) {
                const currentYear = new Date().getFullYear();
                finalMembers = finalMembers.filter(m => {
                    const age = currentYear - parseInt(m.birth_year) + 1;
                    if (fAge === '20') return age >= 20 && age < 30;
                    if (fAge === '30') return age >= 30 && age < 40;
                    if (fAge === '40') return age >= 40;
                    return true;
                });
            }

            // 정렬
            if (fSort === 'birth_asc') {
                finalMembers.sort((a, b) => b.birth_year - a.birth_year);
            } else if (fSort === 'birth_desc') {
                finalMembers.sort((a, b) => a.birth_year - b.birth_year);
            } else {
                // recent (default) - updated_at 기준
                finalMembers.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
            }

            if (finalMembers.length === 0) {
                document.getElementById('noMembersMsg').style.display = 'block';
                document.getElementById('membersGrid').innerHTML = '';
                return;
            }

            // 8. Fetch my Likes and Received Likes (기능 3번)
            const { data: myLikes } = await db.from('likes').select('to_user_id').eq('from_user_id', sessionUser.id);
            const likedUserIds = (myLikes || []).map(l => l.to_user_id);

            const { data: recLikes } = await db.from('likes').select('id, from_user_id').eq('to_user_id', sessionUser.id);
            
            // 읽음 처리 로직 (신청관리와 동일)
            const seenLikeIdsKey = `seenLikeIds_${sessionUser.id}`;
            const seenLikeIds = JSON.parse(localStorage.getItem(seenLikeIdsKey) || '[]');
            const currentLikeIds = (recLikes || []).map(l => l.id);

            const grid = document.getElementById('membersGrid');
            grid.innerHTML = finalMembers.map(m => {
                const info = msgInfoMap[m.user_id];
                const isLiked = likedUserIds.includes(m.user_id);
                const recLikeRecord = (recLikes || []).find(l => l.from_user_id === m.user_id);
                const hasLikedMe = !!recLikeRecord;
                const isNewLike = hasLikedMe && !seenLikeIds.includes(recLikeRecord.id);

                let badge = '';
                if (info && info.unread > 0) {
                    badge = `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);"><span class="msg-badge" style="margin-left: 0;"><i class="ph-fill ph-chat-circle-dots"></i> ${info.unread}개 새 메시지</span></div>`;
                } else if (info && info.total > 0) {
                    badge = `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);"><span style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem; color: #7c8aff; font-weight: 600;"><i class="ph-fill ph-chat-circle-dots"></i> 대화 중</span></div>`;
                }

                // 나를 좋아하는 경우 뱃지 추가 (항상 유지)
                const likedMeBadge = hasLikedMe ? `<span class="like-badge" style="position: absolute; top: 15px; left: 15px; z-index: 20; background: rgba(255, 77, 109, 0.9);"><i class="ph-fill ph-heart"></i> Liked You</span>` : '';

                return `
                <div class="member-card" onclick="window.location.href='profile_view.html?id=${encodeURIComponent(m.user_id)}'">
                    <div class="member-photo-blur"></div>
                    ${likedMeBadge}
                    <button class="btn-like ${isLiked ? 'active' : ''}" onclick="event.stopPropagation(); toggleLike('${m.user_id}', this)" title="관심 있어요">
                        <i class="${isLiked ? 'ph-fill' : 'ph'} ph-heart"></i>
                    </button>
                    <div class="member-info">
                        <div class="member-name-age">${escapeHtml(m.name)} <span style="font-weight: 400; color: #888;">· ${escapeHtml(m.birth_year)}년생</span></div>
                        <div style="color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(m.location)} · ${escapeHtml(m.height)}cm</div>
                        <div class="member-tags">
                            <span class="member-tag">${escapeHtml(m.job)}</span>
                            <span class="member-tag">${escapeHtml(m.mbti)}</span>
                            <span class="member-tag">${escapeHtml(m.body_type)}</span>
                        </div>
                        ${badge}
                    </div>
                </div>
            `;
            }).join('');

            // 모든 현재 좋아요를 '읽음' 상태로 저장
            localStorage.setItem(seenLikeIdsKey, JSON.stringify(currentLikeIds));
        };

        // 좋아요 토글 (기능 3번)
        window.toggleLike = async (targetId, btn) => {
            if (!db || !sessionUser) return;
            const icon = btn.querySelector('i');
            const isActive = btn.classList.contains('active');

            if (isActive) {
                // 취소
                const { error } = await db.from('likes').delete().eq('from_user_id', sessionUser.id).eq('to_user_id', targetId);
                if (!error) {
                    btn.classList.remove('active');
                    icon.className = 'ph ph-heart';
                }
            } else {
                // 추가
                const { error } = await db.from('likes').insert([{ from_user_id: sessionUser.id, to_user_id: targetId }]);
                if (!error) {
                    btn.classList.add('active');
                    icon.className = 'ph-fill ph-heart';
                    // 애니메이션 효과
                    btn.style.transform = 'scale(1.3)';
                    setTimeout(() => btn.style.transform = '', 200);
                }
            }
        };

        loadMembers();

        // 필터 적용 핸들러 (기능 2번)
        const btnApplyFilter = document.getElementById('btnApplyFilter');
        if (btnApplyFilter) {
            btnApplyFilter.addEventListener('click', loadMembers);
        }
    }

    // --- Match Status Page Logic ---
    const isMatchStatusPage = window.location.pathname.includes('match_status.html');
    if (isMatchStatusPage) {
        const sessionUser = getSessionUser();
        if (!sessionUser) {
            window.location.href = 'index.html';
            return;
        }

        const loadMatchStatus = async () => {
            if (!db || !sessionUser) return;

            // Admin Impersonation Logic (Feature 4)
            const urlParams = new URLSearchParams(window.location.search);
            const adminTargetId = urlParams.get('id');
            const targetId = (adminTargetId && sessionUser.role === 'admin') ? adminTargetId : sessionUser.id;

            // 1. Get Seen IDs from localStorage to determine what's "NEW"
            const seenIdsKey = `seenMatchIds_${targetId}`;
            const seenIds = JSON.parse(localStorage.getItem(seenIdsKey) || '[]');

            const { data: profiles } = await db.from('profiles').select('*');
            const profileMap = {};
            profiles?.forEach(p => profileMap[p.user_id] = p);

            const { data: sent } = await db.from('matches').select('*').eq('from_user_id', targetId);
            const { data: received } = await db.from('matches').select('*').eq('to_user_id', targetId);

            document.getElementById('loadingArea').style.display = 'none';
            document.getElementById('statusContent').style.display = 'block';

            const matchedList = document.getElementById('matchedList');
            const receivedList = document.getElementById('receivedList');
            const sentList = document.getElementById('sentList');

            const matchedItems = []; 
            const receivedItems = [];
            const sentItems = [];
            const matchedIds = [];
            const currentRecordIds = []; // All IDs currently visible

            const renderItem = (userId, badgeText, badgeClass = '', isMatched = false, showDelete = false, isNew = false) => {
                const p = profileMap[userId];
                if (!p) return '';

                let finalBadgeText = badgeText;
                let finalBadgeClass = badgeClass;

                // 헬퍼: 현재 탭의 데이터 소스에서 상태 확인
                const rReq = received?.find(item => item.from_user_id === userId);
                if (rReq && (rReq.status === 'rejected')) {
                    finalBadgeText = '거절함';
                    finalBadgeClass = '';
                }

                const sReq = sent?.find(item => item.to_user_id === userId);
                if (sReq && (sReq.status === 'rejected')) {
                    finalBadgeText = '거절됨';
                    finalBadgeClass = '';
                }

                // 신청 메시지 (기능 7번)
                let matchMsgHtml = '';
                if (rReq && rReq.message && !isMatched) {
                    matchMsgHtml = `<div style="margin-top: 8px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 8px; font-size: 0.85rem; color: #ddd; border-left: 3px solid var(--primary);">
                        <i class="ph-fill ph-chat-circle-dots" style="color: var(--primary); margin-right: 4px;"></i> "${escapeHtml(rReq.message)}"
                    </div>`;
                }

                return `
                    <div class="match-item ${isMatched ? 'success' : ''} ${isNew ? 'is-new' : ''}" onclick="window.location.href='profile_view.html?id=${userId}'">
                        <div class="user-info">
                            <div class="user-avatar-small"><i class="ph-fill ph-user"></i></div>
                            <div class="user-details">
                                <h4>${isNew ? '<span class="new-badge">NEW</span>' : ''}${p.name}</h4>
                                <p>${p.birth_year}년생 · ${p.location} · ${p.height}cm</p>
                                <div style="display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap;">
                                    <span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 8px; background: rgba(255,255,255,0.08); color: #aaa;">${p.job}</span>
                                    <span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 8px; background: rgba(255,255,255,0.08); color: #aaa;">${p.mbti}</span>
                                    <span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 8px; background: rgba(255,255,255,0.08); color: #aaa;">${p.body_type}</span>
                                </div>
                                ${matchMsgHtml}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="match-status-badge ${finalBadgeClass}">${finalBadgeText}</span>
                            ${showDelete ? `<button class="btn-icon" style="font-size: 1.2rem; color: #666; padding: 5px;" onclick="event.stopPropagation(); deleteMatch('${userId}')" title="삭제"><i class="ph ph-trash"></i></button>` : ''}
                        </div>
                    </div>
                `;
            };

            // Identify Likes Received (Feature 2)
            const { data: myLikesRec } = await db.from('likes').select('*').eq('to_user_id', targetId);
            const likeRecList = document.getElementById('likeRecList');
            const likeCountBadge = document.getElementById('likeCountBadge');

            const seenLikeIdsKey = `seenLikeIds_${targetId}`;
            const seenLikeIds = JSON.parse(localStorage.getItem(seenLikeIdsKey) || '[]');
            const currentLikeIds = (myLikesRec || []).map(l => l.id);

            if (likeRecList) {
                if (myLikesRec && myLikesRec.length > 0) {
                    const newLikesCount = myLikesRec.filter(l => !seenLikeIds.includes(l.id)).length;
                    
                    if (likeCountBadge) {
                        if (newLikesCount > 0) {
                            likeCountBadge.innerText = newLikesCount;
                            likeCountBadge.style.display = 'inline-flex';
                        } else {
                            likeCountBadge.style.display = 'none';
                        }
                    }
                    
                    likeRecList.innerHTML = myLikesRec.map(l => renderItem(l.from_user_id, '나를 좋아함', 'badge-success', false, false, !seenLikeIds.includes(l.id))).join('');
                    document.getElementById('likeSection').style.display = 'block';
                } else {
                    document.getElementById('likeSection').style.display = 'none';
                }
            }

            // 모든 현재 좋아요를 '읽음' 상태로 저장
            localStorage.setItem(seenLikeIdsKey, JSON.stringify(currentLikeIds));

            // Identify Mutual Matches
            sent?.forEach(s => {
                const mutualRec = received?.find(r => r.from_user_id === s.to_user_id && r.status === 'pending');
                const isMutual = mutualRec && s.status === 'pending';
                
                if (isMutual) {
                    matchedIds.push(s.to_user_id);
                    currentRecordIds.push(s.id);
                    if (mutualRec) currentRecordIds.push(mutualRec.id);
                    
                    const isNew = !seenIds.includes(s.id) || (mutualRec && !seenIds.includes(mutualRec.id));
                    matchedItems.push({ userId: s.to_user_id, isNew });
                } else if (s.status === 'pending' || s.status === 'rejected') {
                    currentRecordIds.push(s.id);
                    if (s.status === 'rejected') {
                        s.wasRejectedByThem = true;
                        s.isNew = !seenIds.includes(s.id);
                    } else {
                        s.isNew = false; // Don't highlight my own newly sent requests
                    }
                    sentItems.push(s);
                }
            });

            received?.forEach(r => {
                if (!matchedIds.includes(r.from_user_id) && (r.status === 'pending' || r.status === 'rejected')) {
                    currentRecordIds.push(r.id);
                    const myResponse = sent?.find(s => s.to_user_id === r.from_user_id);
                    r.myResponseStatus = myResponse?.status;
                    // Highlight if new pending request received
                    r.isNew = r.status === 'pending' && !seenIds.includes(r.id);
                    receivedItems.push(r);
                }
            });

            matchedList.innerHTML = matchedItems.length > 0 ? matchedItems.map(item => renderItem(item.userId, '매칭 성공', 'badge-success', true, false, item.isNew)).join('') : '<p style="font-size:0.9rem; color:#666; padding:10px;">아직 매칭된 인연이 없습니다.</p>';
            receivedList.innerHTML = receivedItems.length > 0 ? receivedItems.map(r => renderItem(r.from_user_id, '확인하기', 'badge-pending', false, true, r.isNew)).join('') : '<p style="font-size:0.9rem; color:#666; padding:10px;">나를 선택한 분이 아직 없습니다.</p>';
            sentList.innerHTML = sentItems.length > 0 ? sentItems.map(s => renderItem(s.to_user_id, '대기 중', '', false, false, s.isNew)).join('') : '<p style="font-size:0.9rem; color:#666; padding:10px;">보낸 신청이 없습니다.</p>';
            
            if (matchedItems.some(i => i.isNew)) document.getElementById('newBadgeMatched').style.display = 'inline-block';
            if (receivedItems.some(i => i.isNew)) document.getElementById('newBadgeReceived').style.display = 'inline-block';
            if (sentItems.some(i => i.isNew)) document.getElementById('newBadgeSent').style.display = 'inline-block';

            // Mark all currently visible IDs as "SEEN"
            localStorage.setItem(seenIdsKey, JSON.stringify(currentRecordIds));
            
            // Also update the global timestamp for the bell icon
            localStorage.setItem(`lastViewedMatches_${sessionUser.id}`, new Date().toISOString());
        };

        window.deleteMatch = async (targetUserId) => {
            if (!confirm('이 신청 내역을 목록에서 삭제하시겠습니까?')) return;
            if (!db || !sessionUser) return;

            // Delete their request to me
            const { error } = await db.from('matches')
                .delete()
                .eq('from_user_id', targetUserId)
                .eq('to_user_id', sessionUser.id);

            if (error) alert('삭제 중 오류 발생: ' + error.message);
            else {
                alert('삭제되었습니다.');
                loadMatchStatus();
            }
        };

        loadMatchStatus();
    }

});
