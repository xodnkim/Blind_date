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
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('signupId').value;
            const password = document.getElementById('signupPassword').value;
            const name = document.getElementById('signupName').value;
            const phone = document.getElementById('signupPhone').value;
            const referrer = document.getElementById('signupReferrer').value;
            
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
                if (mainTitle) mainTitle.innerText = '인연을 찾아보세요 ✨';
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
            }
        };
        checkProfileStatus();

        // 5. Check for Notifications (New match requests received)
        const checkNotifications = async () => {
            if (!db || !sessionUser) return;
            
            const lastViewed = localStorage.getItem(`lastViewedMatches_${sessionUser.id}`);
            if (!lastViewed) return;
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
                    // 3. New match (either person gets the notification)
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

                const profileData = {
                    user_id: sessionUser.id,
                    name: document.getElementById('profileName').value,
                    gender: document.querySelector('input[name="gender"]:checked')?.value || '',
                    birth_year: document.getElementById('birthYear').value,
                    body_type: document.getElementById('bodyType').value,
                    location: document.getElementById('location').value,
                    height: document.getElementById('height').value,
                    job: document.getElementById('job').value,
                    job_location: document.getElementById('jobLocation').value,
                    mbti: document.getElementById('mbti').value,
                    smoking: document.getElementById('smoking').value,
                    drinking: document.getElementById('drinking').value,
                    tattoo: document.getElementById('tattoo').value,
                    religion: document.getElementById('religion').value,
                    long_distance: document.getElementById('longDistance').value,
                    hobbies: document.getElementById('hobbies').value,
                    intro_message: document.getElementById('introMessage').value,
                    ideal_type: document.getElementById('idealType').value,
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

        const loadPendingUsers = async () => {
            const listBody = document.getElementById('adminUserList');
            if (!listBody || !db) return;

            const { data: users, error } = await db.from('users').select('*').order('created_at', { ascending: false });
            
            if (error) {
                listBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--primary);">오류 발생: ${error.message}</td></tr>`;
                return;
            }

            if (!users || users.length === 0) {
                listBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">가입 대기 중인 회원이 없습니다.</td></tr>`;
                return;
            }

            listBody.innerHTML = users.map(u => `
                <tr>
                    <td>${escapeHtml(u.id)}</td>
                    <td>${escapeHtml(u.name)}</td>
                    <td>${escapeHtml(u.phone || '-')}</td>
                    <td>${escapeHtml(u.referrer || '-')}</td>
                    <td>${new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${u.status === 'pending'
                                ? `<button class="btn-small" onclick="approveUser('${escapeHtml(u.id)}')">승인하기</button>`
                                : `<span class="badge approved" style="margin-right: 0;">승인완료</span>`
                            }
                            ${u.role !== 'admin' ? `<button class="btn-small" style="background: rgba(255, 77, 109, 0.1); color: #ff4d6d; border: 1px solid rgba(255, 77, 109, 0.3);" onclick="deleteUser('${escapeHtml(u.id)}')"><i class="ph ph-user-minus"></i> 탈퇴</button>` : ''}
                        </div>
                    </td>
                </tr>
            `).join('');
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

        window.deleteUser = async (userId) => {
            if (!confirm(`정말 ${userId} 회원을 탈퇴 처리하시겠습니까?\n해당 회원의 프로필 및 모든 매칭 데이터가 영구적으로 삭제됩니다.`)) return;
            
            if (!db) return;

            try {
                // 1. 매칭 데이터 삭제 (보낸 것, 받은 것 모두)
                await db.from('matches').delete().or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
                
                // 2. 프로필 데이터 삭제
                await db.from('profiles').delete().eq('user_id', userId);
                
                // 3. 사용자 계정 삭제
                const { error } = await db.from('users').delete().eq('id', userId);
                
                if (error) throw error;
                
                alert(`${userId} 회원이 성공적으로 탈퇴 처리되었습니다.`);
                loadPendingUsers();
            } catch (err) {
                alert('탈퇴 처리 중 오류 발생: ' + err.message);
                console.error(err);
            }
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
            }

            document.getElementById('profileViewCard').style.display = 'block';

            // 3. Photo Slider Logic
            // 보안: 매칭 전에는 photo URL 자체를 클라이언트에 전달하지 않음
            const PLACEHOLDER_PHOTO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" fill="%23333"><rect width="400" height="400" fill="%231a1a2e"/><text x="200" y="185" text-anchor="middle" fill="%23666" font-size="48">🔒</text><text x="200" y="230" text-anchor="middle" fill="%23666" font-size="16">매칭 후 공개됩니다</text></svg>');
            const allPhotos = [profile.photo1, profile.photo2, profile.photo3].filter(p => p);
            
            // 매칭되었거나 본인 프로필인 경우에만 실제 URL 사용
            const photos = (isSelf || isMatched) ? allPhotos : allPhotos.map(() => PLACEHOLDER_PHOTO);
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

                // Blur logic: 매칭 전에는 placeholder에 추가 blur 적용
                if (!isSelf && !isMatched) {
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

            // 채팅 영역 표시 (본인 아닌 경우만)
            if (!isSelf) {
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
                actionArea.style.display = 'block';
                
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
                    } else {
                        // New request or accepting incoming
                        const { error } = await db.from('matches').upsert([{ 
                            from_user_id: sessionUser.id, 
                            to_user_id: targetUserId, 
                            status: 'pending' 
                        }]);
                        
                        if (error) {
                            alert('신청 중 오류 발생: ' + error.message);
                        } else {
                            alert('매칭 신청을 보냈습니다!');
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

            if (filteredMembers.length === 0) {
                document.getElementById('noMembersMsg').style.display = 'block';
                return;
            }

            const grid = document.getElementById('membersGrid');
            grid.innerHTML = filteredMembers.map(m => `
                <div class="member-card" onclick="window.location.href='profile_view.html?id=${encodeURIComponent(m.user_id)}'">
                    <div class="member-photo-blur"></div>
                    <div class="member-info">
                        <div class="member-name-age">${escapeHtml(m.name)} <span style="font-weight: 400; color: #888;">· ${escapeHtml(m.birth_year)}년생</span></div>
                        <div style="color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(m.location)} · ${escapeHtml(m.height)}cm</div>
                        <div class="member-tags">
                            <span class="member-tag">${escapeHtml(m.job)}</span>
                            <span class="member-tag">${escapeHtml(m.mbti)}</span>
                            <span class="member-tag">${escapeHtml(m.body_type)}</span>
                        </div>
                    </div>
                </div>
            `).join('');
        };

        loadMembers();
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

            // 1. Get Seen IDs from localStorage to determine what's "NEW"
            const seenIdsKey = `seenMatchIds_${sessionUser.id}`;
            const seenIds = JSON.parse(localStorage.getItem(seenIdsKey) || '[]');

            const { data: profiles } = await db.from('profiles').select('*');
            const profileMap = {};
            profiles?.forEach(p => profileMap[p.user_id] = p);

            const { data: sent } = await db.from('matches').select('*').eq('from_user_id', sessionUser.id);
            const { data: received } = await db.from('matches').select('*').eq('to_user_id', sessionUser.id);

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

            const renderItem = (userId, badgeText, badgeClass = '', isMatched = false, showDelete = false, isNew = false) => {
                const p = profileMap[userId];
                if (!p) return '';

                let finalBadgeText = badgeText;
                let finalBadgeClass = badgeClass;

                const rReq = receivedItems.find(item => item.from_user_id === userId);
                if (rReq && (rReq.myResponseStatus === 'rejected' || rReq.status === 'rejected')) {
                    finalBadgeText = '거절함';
                    finalBadgeClass = '';
                }

                const sReq = sentItems.find(item => item.to_user_id === userId);
                if (sReq && (sReq.wasRejectedByThem || sReq.status === 'rejected')) {
                    finalBadgeText = '거절됨';
                    finalBadgeClass = '';
                }

                return `
                    <div class="match-item ${isMatched ? 'success' : ''} ${isNew ? 'is-new' : ''}" onclick="window.location.href='profile_view.html?id=${userId}'">
                        <div class="user-info">
                            <div class="user-avatar-small"><i class="ph-fill ph-user"></i></div>
                            <div class="user-details">
                                <h4>${isNew ? '<span class="new-badge">NEW</span>' : ''}${p.name}</h4>
                                <p>${p.birth_year}년생 · ${p.location}</p>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="match-status-badge ${finalBadgeClass}">${finalBadgeText}</span>
                            ${showDelete ? `<button class="btn-icon" style="font-size: 1.2rem; color: #666; padding: 5px;" onclick="event.stopPropagation(); deleteMatch('${userId}')" title="삭제"><i class="ph ph-trash"></i></button>` : ''}
                        </div>
                    </div>
                `;
            };

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
