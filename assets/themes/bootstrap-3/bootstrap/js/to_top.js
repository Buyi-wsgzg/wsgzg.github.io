jQuery.noConflict(),jQuery(document).ready(function(){jQuery("#to_top").hide(),jQuery("#to_top a:first").click(function(){jQuery("html,body").animate({scrollTop:0},200)});var a=parseInt(jQuery("body").css("height"));jQuery("#to_top a:last").click(function(){jQuery("html,body").animate({scrollTop:a},200)}),jQuery(window).scroll(function(){jQuery(this).scrollTop()>200?jQuery("#to_top").fadeIn():jQuery("#to_top").fadeOut()}),jQuery("div.entry-content img").each(function(){var a="<a id='fancyBox' href='"+this.src+"'></a>";jQuery(this).wrapAll(a)}),jQuery("#fancyBox").fancybox({openEffect:"elastic",closeEffect:"elastic"})});
